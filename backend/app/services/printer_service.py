"""Printer service for ESC/POS-style tickets and price labels."""
from __future__ import annotations

import os
import re
import threading
import unicodedata
from decimal import Decimal
from pathlib import Path
from textwrap import shorten, wrap

from flask import current_app, has_app_context

from app.extensions import db
from app.models.product import Product
from app.models.sale import Sale, SaleReturn
from app.services import config_service
from app.utils.timeutil import to_local

# Página de códigos -> valor n de `ESC t n` (Epson ESC/POS)
CODEPAGES = {
    "cp437": 0,
    "cp850": 2,
    "cp858": 19,
    "cp1252": 16,
}
DEFAULT_CODEPAGE = "cp850"

ESC_INIT = b"\x1b@"
DRAWER_KICK = b"\x1bp\x00\x19\x96"  # ESC p 0 25 150: pulso al pin 2 del cajón
FEED_AND_CUT = b"\x1bd\x04\x1dV\x42\x00"  # ESC d 4 + GS V 66 0: avanza y corta

_DEVICE_RE = re.compile(r"^(COM\d{1,3}|LPT\d)$", re.IGNORECASE)
_RAW_DEVICE_RE = re.compile(r"^\\\\\.\\(COM\d{1,3}|LPT\d)$", re.IGNORECASE)
# Destinos de archivo permitidos (spooler "imprimir a archivo" y pruebas). Nunca otros archivos (OPS-04).
PRINT_FILE_SUFFIXES = (".prn",)
PRINTER_PATH_MAX = 255  # CashRegister.printer_path es String(255)

# Escrituras en curso por destino (impresora del servidor), para no apilar hilos colgados (OPS-12)
_busy_writers: dict[str, threading.Thread] = {}
_busy_lock = threading.Lock()

# Sustituciones para caracteres que no existen en la página de códigos
_TRANSLITERATIONS = {"€": "EUR", "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-", "…": "..."}


class PrinterService:
    """Formats sale tickets and price labels, then optionally writes them out."""

    WIDTH = 42
    WRITE_TIMEOUT = 5  # segundos

    @staticmethod
    def _company_info() -> dict:
        """Datos de la empresa para el ticket, desde la configuración del sistema."""
        def first(*keys: str) -> str:
            for key in keys:
                value = config_service.get(key)
                if value:
                    return value.strip()
            return ""

        return {
            "name": first("business_name", "company_name") or "POS Local",
            "address": first("company_address", "business_address"),
            "phone": first("company_phone", "business_phone"),
            "rfc": first("company_rfc", "business_rfc", "rfc"),
            "footer": first("ticket_footer") or "Gracias por su compra",
        }

    @staticmethod
    def format_sale_ticket(sale: Sale, business_name: str | None = None) -> str:
        """Create a plain text ticket that can be sent to an ESC/POS printer."""
        company = PrinterService._company_info()
        name = business_name or company["name"]
        created_at = to_local(sale.created_at).strftime("%Y-%m-%d %H:%M")
        cashier = sale.user.username if sale.user else f"Usuario {sale.user_id}"

        lines = [PrinterService._center(name)]
        if company["address"]:
            lines.append(PrinterService._center(company["address"]))
        if company["phone"]:
            lines.append(PrinterService._center(f"Tel: {company['phone']}"))
        if company["rfc"]:
            lines.append(PrinterService._center(f"RFC: {company['rfc']}"))
        # Una venta cancelada o con devolución no debe poder pasar por un comprobante vigente (RF-15)
        status_lines = PrinterService._status_lines(sale)
        lines += [
            PrinterService._line(),
            *status_lines,
            PrinterService._kv("Folio", sale.folio),
            PrinterService._kv("Fecha", created_at),
            PrinterService._kv("Cajero", cashier),
            PrinterService._line(),
        ]

        for item in sale.items:
            lines.append(shorten(PrinterService._clean(item.product_name), width=PrinterService.WIDTH, placeholder="..."))
            qty_price = f"{PrinterService._qty(item.quantity)} x {PrinterService._money(item.unit_price)}"
            lines.append(PrinterService._kv(qty_price, PrinterService._money(item.subtotal)))
            if item.discount_amount and item.discount_amount > 0:
                lines.append(PrinterService._kv("Descuento", f"-{PrinterService._money(item.discount_amount)}"))

        lines.extend(
            [
                PrinterService._line(),
                PrinterService._kv("Subtotal", PrinterService._money(sale.subtotal)),
                PrinterService._kv("Descuento", f"-{PrinterService._money(sale.discount_total)}"),
                PrinterService._kv("IVA", PrinterService._money(sale.tax_total)),
                PrinterService._line(),
                PrinterService._kv("TOTAL", PrinterService._money(sale.total)),
                PrinterService._line(),
            ]
        )

        for payment in sale.payments:
            method = payment.method.upper()
            lines.append(PrinterService._kv(method, PrinterService._money(payment.amount)))
            if payment.change_amount and payment.change_amount > 0:
                lines.append(PrinterService._kv("Cambio", PrinterService._money(payment.change_amount)))
            if payment.reference:
                lines.append(PrinterService._kv("Ref", payment.reference))

        lines.append(PrinterService._line())
        if status_lines:
            # Se repite al final para que no se pueda recortar el encabezado
            lines += [*status_lines, PrinterService._line()]
        for footer_line in company["footer"].splitlines():
            lines.append(PrinterService._center(footer_line))
        lines.append("")
        return "\n".join(lines)

    @staticmethod
    def _status_lines(sale: Sale) -> list[str]:
        """Marca de estado del ticket: vacía si la venta está vigente (RF-15)."""
        status = sale.status or "completada"
        if status == "cancelada":
            lines = [PrinterService._center("*** VENTA CANCELADA ***")]
            if sale.cancel_reason:
                reason = " ".join(PrinterService._clean(sale.cancel_reason).split())
                lines += wrap(f"Motivo: {reason}", width=PrinterService.WIDTH)[:3]
            return lines
        if status in ("devolucion_parcial", "devolucion_total"):
            refunded = db.session.query(
                db.func.coalesce(db.func.sum(SaleReturn.refund_total), Decimal("0"))
            ).filter(SaleReturn.sale_id == sale.id).scalar()
            label = "PARCIAL" if status == "devolucion_parcial" else "TOTAL"
            return [
                PrinterService._center(f"*** CON DEVOLUCIÓN {label} ***"),
                PrinterService._kv("Reembolsado", PrinterService._money(refunded)),
            ]
        return []

    @staticmethod
    def format_price_label(product: Product, business_name: str | None = None) -> str:
        """Create a compact product price label with an ESC/POS Code 128 barcode."""
        name = business_name or PrinterService._company_info()["name"]
        code = PrinterService._barcode_value(product.barcode or product.sku)
        lines = [
            PrinterService._center(name),
            PrinterService._line(),
            shorten(PrinterService._clean(product.name), width=PrinterService.WIDTH, placeholder="..."),
            PrinterService._kv("SKU", product.sku),
            PrinterService._center(f"${PrinterService._decimal(product.sale_price):.2f}"),
            PrinterService._line(),
            PrinterService._center(f"CODIGO {code}"),
            PrinterService._barcode_command(code),
            "",
        ]
        return "\n".join(lines)

    @staticmethod
    def resolve_printer(sale: Sale | None = None) -> tuple[str | None, str]:
        """Impresora (ruta, página de códigos) de la caja de la venta; si no tiene, la global."""
        register = sale.session.cash_register if sale is not None and sale.session else None
        codepage = (register.printer_codepage if register else None) or DEFAULT_CODEPAGE
        path = (register.printer_path if register else None) or os.getenv("PRINTER_DEVICE_PATH")
        return path, codepage

    @staticmethod
    def validate_target(target: str | os.PathLike) -> str:
        """Valida el destino: ruta absoluta local o puerto COM/LPT. Rechaza rutas UNC y relativas."""
        target_str = str(target).strip()
        # La columna printer_path es varchar(255): una ruta más larga daba 500 al guardar (RF-12)
        if len(target_str) > PRINTER_PATH_MAX:
            raise ValueError(f"La ruta de la impresora admite como máximo {PRINTER_PATH_MAX} caracteres")
        device = _DEVICE_RE.match(target_str) or _RAW_DEVICE_RE.match(target_str)
        if device:
            name = device[1].upper()
            # En Win32, COM10 o mayor solo existe como \\.\COMn; sin el prefijo se crearía un archivo
            if name.startswith("COM") and int(name[3:]) >= 10:
                return "\\\\.\\" + name
            return name
        if target_str.startswith(("\\\\", "//")):
            raise ValueError("Ruta de impresora no válida")
        path = Path(target_str)
        if not path.is_absolute():
            raise ValueError("La ruta de la impresora debe ser absoluta o un puerto COM/LPT")
        if path.suffix.lower() not in PRINT_FILE_SUFFIXES:
            raise ValueError("La impresora debe ser un puerto COM/LPT o un archivo .prn")
        return target_str

    @staticmethod
    def validate_codepage(codepage: str | None) -> str:
        cp = (codepage or DEFAULT_CODEPAGE).lower()
        if cp not in CODEPAGES:
            raise ValueError(
                f"Página de códigos no soportada: '{codepage}'. Usa una de: {', '.join(CODEPAGES)}"
            )
        return cp

    @staticmethod
    def encode_text(content: str, codepage: str) -> bytes:
        """Codifica en la página de códigos y translitera lo que no exista (Á -> A, € -> EUR)."""
        out = bytearray()
        for char in content:
            try:
                out += char.encode(codepage)
                continue
            except UnicodeEncodeError:
                pass
            replacement = _TRANSLITERATIONS.get(char)
            if replacement is None:
                decomposed = unicodedata.normalize("NFKD", char)
                replacement = "".join(c for c in decomposed if not unicodedata.combining(c))
            out += replacement.encode(codepage, errors="replace")
        return bytes(out)

    @staticmethod
    def build_payload(content: str, codepage: str = DEFAULT_CODEPAGE, kick_drawer: bool = False) -> bytes:
        """Bytes ESC/POS: inicializar, página de códigos, [cajón], texto, avance y corte."""
        cp = PrinterService.validate_codepage(codepage)
        payload = ESC_INIT + bytes([0x1B, 0x74, CODEPAGES[cp]])
        if kick_drawer:
            payload += DRAWER_KICK
        return payload + PrinterService.encode_text(content, cp) + b"\n" + FEED_AND_CUT

    @staticmethod
    def _write(target: str, payload: bytes) -> None:
        """Escribe en la impresora con timeout para no bloquear el request si está colgada.

        Si una escritura anterior al mismo destino sigue colgada, no se lanza otra: así no se
        acumulan pulsos de cajón que se abrirían todos juntos al liberarse el puerto (OPS-12).
        """
        with _busy_lock:
            previous = _busy_writers.get(target)
            if previous is not None and previous.is_alive():
                raise RuntimeError("Impresora no disponible: la escritura anterior sigue sin terminar")
        error: list[BaseException] = []

        def worker():
            try:
                Path(target).write_bytes(payload)
            except BaseException as exc:  # noqa: BLE001 - se re-lanza en el hilo principal
                error.append(exc)

        thread = threading.Thread(target=worker, daemon=True)
        with _busy_lock:
            _busy_writers[target] = thread
        thread.start()
        thread.join(PrinterService.WRITE_TIMEOUT)
        if thread.is_alive():
            raise RuntimeError("Impresora no disponible: tiempo de espera agotado")
        if error:
            raise RuntimeError(f"Impresora no disponible: {error[0]}") from error[0]

    @staticmethod
    def send_to_printer(
        content: str,
        printer_path: str | os.PathLike | None = None,
        kick_drawer: bool = False,
        codepage: str = DEFAULT_CODEPAGE,
    ) -> bool:
        """Write ESC/POS bytes to the configured printer device/file.

        In production this can point at a raw device path or a COM/LPT port.
        Tests can pass a normal file path.
        """
        target = printer_path or os.getenv("PRINTER_DEVICE_PATH")
        if not target:
            raise ValueError("Ruta de impresora no configurada")

        target_str = PrinterService.validate_target(target)
        payload = PrinterService.build_payload(content, codepage, kick_drawer)
        PrinterService._write(target_str, payload)
        return True

    @staticmethod
    def _agent_register(sale: Sale | None):
        register = sale.session.cash_register if sale is not None and sale.session else None
        return register if register is not None and register.print_via_agent else None

    @staticmethod
    def dispatch_sale_ticket(sale: Sale, content: str) -> str:
        """Imprime el ticket en la impresora de la caja. Devuelve "queued" si lo imprimirá el agente."""
        path, codepage = PrinterService.resolve_printer(sale)
        register = PrinterService._agent_register(sale)
        if register is not None:
            from app.services import print_queue_service

            print_queue_service.enqueue(register.id, "ticket", PrinterService.build_payload(content, codepage))
            return "queued"
        PrinterService.send_to_printer(content, path, codepage=codepage)
        return "sent"

    @staticmethod
    def open_drawer_for_sale(sale: Sale) -> bool:
        """Abre el cajón de la caja de la venta (best-effort). Nunca lanza excepción."""
        path, codepage = PrinterService.resolve_printer(sale)
        register = PrinterService._agent_register(sale)
        if register is not None:
            from app.services import print_queue_service

            try:
                cp = PrinterService.validate_codepage(codepage)
                print_queue_service.enqueue(
                    register.id, "drawer", ESC_INIT + bytes([0x1B, 0x74, CODEPAGES[cp]]) + DRAWER_KICK
                )
                return True
            except Exception as exc:  # noqa: BLE001 - la venta ya está confirmada; el cajón es best-effort
                from app.extensions import db

                db.session.rollback()
                if has_app_context():
                    current_app.logger.warning("No se pudo encolar el cajón de la venta %s: %s", sale.folio, exc)
                return False
        if not path:
            return False
        try:
            target = PrinterService.validate_target(path)
            cp = PrinterService.validate_codepage(codepage)
            PrinterService._write(target, ESC_INIT + bytes([0x1B, 0x74, CODEPAGES[cp]]) + DRAWER_KICK)
            return True
        except (ValueError, RuntimeError) as exc:
            if has_app_context():
                current_app.logger.warning(
                    "No se pudo abrir el cajón de la venta %s: %s", sale.folio, exc
                )
            return False

    @staticmethod
    def _line() -> str:
        return "-" * PrinterService.WIDTH

    @staticmethod
    def _clean(value) -> str:
        """Quita caracteres de control (C0, DEL y C1) de los datos: un nombre o una referencia con
        ESC/GS no debe convertirse en un comando para la impresora, p. ej. abrir el cajón (SEC-100)."""
        return "".join(
            ch for ch in str(value) if not (ord(ch) < 0x20 or 0x7F <= ord(ch) <= 0x9F)
        )

    @staticmethod
    def _center(value: str) -> str:
        value = PrinterService._clean(value)
        return value[: PrinterService.WIDTH].center(PrinterService.WIDTH).rstrip()

    @staticmethod
    def _kv(label: str, value: str) -> str:
        label = PrinterService._clean(label)
        value = PrinterService._clean(value)
        space = PrinterService.WIDTH - len(label) - len(value)
        if space < 1:
            return f"{label} {value}"[: PrinterService.WIDTH]
        return f"{label}{' ' * space}{value}"

    @staticmethod
    def _decimal(value) -> Decimal:
        return Decimal(str(value))

    @staticmethod
    def _money(value) -> str:
        return f"${PrinterService._decimal(value).quantize(Decimal('0.01'))}"

    @staticmethod
    def _qty(value) -> str:
        normalized = PrinterService._decimal(value).normalize()
        return format(normalized, "f")

    @staticmethod
    def _barcode_value(value: str | None) -> str:
        """Return a printable Code 128-B value supported by ESC/POS printers."""
        raw_value = str(value or "").strip()
        sanitized = "".join(char for char in raw_value if 32 <= ord(char) <= 126)
        return sanitized[:80] or "NO-CODE"

    @staticmethod
    def _barcode_command(value: str) -> str:
        """Build an ESC/POS Code 128 barcode command with HRI text below."""
        payload = "{B" + value
        if len(payload) > 255:
            payload = payload[:255]
        return (
            "\x1dH\x02"  # Print human-readable text below the barcode.
            "\x1dhP"  # Barcode height: 80 dots.
            "\x1dw\x02"  # Barcode module width: 2.
            "\x1dkI" + chr(len(payload)) + payload
        )
