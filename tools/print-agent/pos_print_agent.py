"""Agente de impresión de caja para POS Retail VRNTAS (OPS-03).

Corre en cada caja que tiene su impresora térmica USB. Cada segundo pide al servidor los trabajos
de su caja (tickets y pulsos de cajón ya armados en ESC/POS) y los envía RAW a la impresora
de Windows. No abre puertos: solo hace peticiones salientes al servidor.

Configuración (variables de entorno o argumentos):
  POS_SERVER_URL    http://<ip-servidor>:5000
  POS_AGENT_KEY     clave generada en Configuración → Cajas (formato <id>.<secreto>)
  POS_PRINTER_NAME  nombre de la impresora en Windows (Panel de control → Impresoras);
                    también acepta COM3 o \\\\.\\COM12 para impresoras seriales.

Requisitos: Python 3.11+ y, para impresoras USB, pywin32 (pip install pywin32).
"""
import argparse
import base64
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request

POLL_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 30.0

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
            with open(printer_name, "wb") as port:
                port.write(data)

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


# ── Ciclo principal ───────────────────────────────────────────────────────


def run_once(fetch_jobs, print_raw, report) -> int:
    """Procesa un lote de trabajos. Devuelve cuántos procesó (impresos o con error)."""
    jobs = fetch_jobs()
    for job in jobs:
        try:
            print_raw(base64.b64decode(job["payload_b64"]))
        except Exception as exc:  # noqa: BLE001 - cualquier fallo de impresión se reporta
            log.warning("No se pudo imprimir el trabajo %s (%s): %s", job["id"], job["kind"], exc)
            report(job["id"], False, str(exc))
        else:
            report(job["id"], True, None)
    return len(jobs)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Agente de impresión de caja (POS Retail VRNTAS)")
    parser.add_argument("--server", default=os.getenv("POS_SERVER_URL"))
    parser.add_argument("--key", default=os.getenv("POS_AGENT_KEY"))
    parser.add_argument("--printer", default=os.getenv("POS_PRINTER_NAME"))
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    missing = [name for name, value in (("--server", args.server), ("--key", args.key), ("--printer", args.printer)) if not value]
    if missing:
        log.error("Faltan parámetros: %s", ", ".join(missing))
        return 2

    fetch_jobs, report = make_http(args.server, args.key)
    print_raw = make_printer(args.printer)
    log.info("Agente iniciado. Servidor: %s · Impresora: %s", args.server, args.printer)

    backoff = POLL_SECONDS
    while True:
        try:
            run_once(fetch_jobs, print_raw, report)
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
