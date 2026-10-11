"""Agente de impresión de caja para POS Retail VRNTAS (OPS-03).

Corre en cada caja que tiene su impresora térmica USB. Cada segundo pide al servidor los trabajos
de su caja (tickets y pulsos de cajón ya armados en ESC/POS) y los envía RAW a la impresora
de Windows. No abre puertos: solo hace peticiones salientes al servidor.

Configuración (variables de entorno o argumentos):
  POS_SERVER_URL      http://<ip-servidor>:5000
  POS_AGENT_KEY_FILE  archivo con la clave generada en Configuración → Cajas (formato <id>.<secreto>),
                      protegido con ACL (lo crea install-agent.ps1). POS_AGENT_KEY solo para pruebas.
  POS_PRINTER_NAME    nombre de la impresora en Windows (Panel de control → Impresoras);
                      también acepta COM3 o \\\\.\\COM12 para impresoras seriales.

Requisitos: Python 3.11+ y, para impresoras USB, pywin32 (pip install pywin32).
"""
import argparse
import base64
import json
import logging
import os
import sys
import threading
import time
import urllib.error
import urllib.request

POLL_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 30.0
PORT_WRITE_TIMEOUT = 5.0
# Bits de win32print.PRINTER_STATUS_* que indican que la impresora no recibirá el trabajo
_NOT_READY_STATUS = {
    0x00000080: "fuera de línea",  # OFFLINE
    0x00000002: "con error",  # ERROR
    0x00000008: "con atasco de papel",  # PAPER_JAM
    0x00000010: "sin papel",  # PAPER_OUT
    0x00000400: "con la tapa abierta",  # DOOR_OPEN
    0x00400000: "sin respuesta",  # NOT_AVAILABLE
    0x00000001: "en pausa",  # PAUSED
}
_ATTRIBUTE_WORK_OFFLINE = 0x00000400

log = logging.getLogger("pos-print-agent")


# ── Comunicación con el servidor ──────────────────────────────────────────


def make_http(server_url: str, agent_key: str, timeout: float = 10.0):
    base = server_url.rstrip("/") + "/api/print-agent"
    headers = {"X-Agent-Key": agent_key, "Content-Type": "application/json"}

    def fetch_jobs() -> list[dict]:
        request = urllib.request.Request(f"{base}/jobs", headers=headers)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))["jobs"]

    def report(job_id: int, ok: bool, error: str | None = None) -> None:
        body = json.dumps({"ok": ok, "error": error}).encode("utf-8")
        request = urllib.request.Request(f"{base}/jobs/{job_id}/result", data=body, headers=headers, method="POST")
        with urllib.request.urlopen(request, timeout=timeout):
            pass

    return fetch_jobs, report


# ── Impresión ─────────────────────────────────────────────────────────────


def make_printer(printer_name: str):
    """Devuelve una función que envía bytes RAW a la impresora."""
    upper = printer_name.upper()
    if upper.startswith(("COM", "LPT", "\\\\.\\")):
        def print_port(data: bytes) -> None:
            # Escritura con timeout: un puerto colgado no debe bloquear al agente (OPS-22)
            error: list[BaseException] = []

            def write():
                try:
                    with open(printer_name, "wb") as port:
                        port.write(data)
                except BaseException as exc:  # noqa: BLE001
                    error.append(exc)

            worker = threading.Thread(target=write, daemon=True)
            worker.start()
            worker.join(PORT_WRITE_TIMEOUT)
            if worker.is_alive():
                raise TimeoutError(f"El puerto {printer_name} no respondió en {PORT_WRITE_TIMEOUT:.0f} s")
            if error:
                raise error[0]

        return print_port

    try:
        import win32print  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - depende de Windows
        raise SystemExit("Falta pywin32: ejecuta 'pip install pywin32' en esta caja.") from exc

    def print_spooler(data: bytes) -> None:  # pragma: no cover - requiere impresora real
        handle = win32print.OpenPrinter(printer_name)
        try:
            win32print.StartDocPrinter(handle, 1, ("Ticket POS", None, "RAW"))
            try:
                win32print.StartPagePrinter(handle)
                win32print.WritePrinter(handle, data)
                win32print.EndPagePrinter(handle)
            finally:
                win32print.EndDocPrinter(handle)
        finally:
            win32print.ClosePrinter(handle)

    return print_spooler


def make_printer_ready(printer_name: str):
    """Devuelve una función que dice por qué la impresora no está lista (o None si lo está).

    Evita dejar trabajos en la cola de Windows con la impresora apagada: se imprimirían (y el cajón
    se abriría) horas después, al encenderla (OPS-18).
    """
    if printer_name.upper().startswith(("COM", "LPT", "\\\\.\\")):
        return lambda: None
    try:
        import win32print  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover
        return lambda: None

    def ready() -> str | None:  # pragma: no cover - requiere impresora real
        handle = win32print.OpenPrinter(printer_name)
        try:
            info = win32print.GetPrinter(handle, 2)
        finally:
            win32print.ClosePrinter(handle)
        if info.get("Attributes", 0) & _ATTRIBUTE_WORK_OFFLINE:
            return "Impresora configurada para trabajar sin conexión"
        status = info.get("Status", 0)
        for bit, reason in _NOT_READY_STATUS.items():
            if status & bit:
                return f"Impresora {reason}"
        if info.get("cJobs", 0) > 0:
            return "La cola de Windows de la impresora tiene trabajos atascados"
        return None

    return ready


# ── Ciclo principal ───────────────────────────────────────────────────────


def _safe_report(report, job_id, ok, error=None) -> None:
    """Un reporte que falla no debe abortar el resto del lote (OPS-17)."""
    try:
        report(job_id, ok, error)
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo reportar el resultado del trabajo %s: %s", job_id, exc)


def run_once(fetch_jobs, print_raw, report, printer_ready=lambda: None) -> int:
    """Procesa un lote de trabajos. Devuelve cuántos procesó (impresos o con error)."""
    jobs = fetch_jobs()
    received_at = time.monotonic()
    for job in jobs:
        # Caducidad local: el servidor envía los segundos restantes (no depende del reloj de la caja)
        expires_in = job.get("expires_in")
        if expires_in is not None and time.monotonic() - received_at >= expires_in:
            _safe_report(report, job["id"], False, "Trabajo caducado antes de imprimirse")
            continue
        try:
            not_ready = printer_ready()
            if not_ready:
                raise RuntimeError(not_ready)
            print_raw(base64.b64decode(job["payload_b64"]))
        except Exception as exc:  # noqa: BLE001 - cualquier fallo de impresión se reporta
            log.warning("No se pudo imprimir el trabajo %s (%s): %s", job["id"], job["kind"], exc)
            _safe_report(report, job["id"], False, str(exc))
        else:
            _safe_report(report, job["id"], True, None)
    return len(jobs)


def read_agent_key(key_file: str | None, key: str | None) -> str | None:
    if key_file:
        with open(key_file, encoding="utf-8") as fh:
            return fh.read().strip()
    return key


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Agente de impresión de caja (POS Retail VRNTAS)")
    parser.add_argument("--server", default=os.getenv("POS_SERVER_URL"))
    parser.add_argument("--key-file", default=os.getenv("POS_AGENT_KEY_FILE"))
    parser.add_argument("--key", default=os.getenv("POS_AGENT_KEY"), help="solo para pruebas; usa --key-file")
    parser.add_argument("--printer", default=os.getenv("POS_PRINTER_NAME"))
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        args.key = read_agent_key(args.key_file, args.key)
    except OSError as exc:
        log.error("No se pudo leer el archivo de la clave: %s", exc)
        return 2
    missing = [name for name, value in (("--server", args.server), ("--key-file", args.key), ("--printer", args.printer)) if not value]
    if missing:
        log.error("Faltan parámetros: %s", ", ".join(missing))
        return 2

    fetch_jobs, report = make_http(args.server, args.key)
    print_raw = make_printer(args.printer)
    printer_ready = make_printer_ready(args.printer)
    log.info("Agente iniciado. Servidor: %s · Impresora: %s", args.server, args.printer)

    backoff = POLL_SECONDS
    while True:
        try:
            run_once(fetch_jobs, print_raw, report, printer_ready)
            backoff = POLL_SECONDS
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                log.error("El servidor rechazó la clave del agente. Genera una nueva en Configuración → Cajas.")
            else:
                log.warning("Error del servidor: %s", exc)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            log.warning("Sin conexión con el servidor: %s", exc)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
        time.sleep(backoff)


if __name__ == "__main__":
    sys.exit(main())
