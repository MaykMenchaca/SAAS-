"""Printer service for ESC/POS-style tickets and price labels."""
from __future__ import annotations

import os
from decimal import Decimal
from pathlib import Path
from textwrap import shorten

from app.models.product import Product
from app.models.sale import Sale


class PrinterService:
    """Formats sale tickets and price labels, then optionally writes them out."""

    WIDTH = 42

    @staticmethod
    def format_sale_ticket(sale: Sale, business_name: str | None = None) -> str:
        """Create a plain text ticket that can be sent to an ESC/POS printer."""
        name = business_name or os.getenv("BUSINESS_NAME", "POS Local")
        created_at = sale.created_at.strftime("%Y-%m-%d %H:%M")
        cashier = sale.user.username if sale.user else f"Usuario {sale.user_id}"

        lines = [
            PrinterService._center(name),
            PrinterService._line(),
            PrinterService._kv("Folio", sale.folio),
            PrinterService._kv("Fecha", created_at),
            PrinterService._kv("Cajero", cashier),
            PrinterService._line(),
        ]

        for item in sale.items:
            lines.append(shorten(item.product_name, width=PrinterService.WIDTH, placeholder="..."))
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

        lines.extend(
            [
                PrinterService._line(),
                PrinterService._center("Gracias por su compra"),
                "",
            ]
        )
        return "\n".join(lines)

    @staticmethod
    def format_price_label(product: Product, business_name: str | None = None) -> str:
        """Create a compact product price label with SKU/barcode text."""
        name = business_name or os.getenv("BUSINESS_NAME", "POS Local")
        code = product.barcode or product.sku
        lines = [
            PrinterService._center(name),
            PrinterService._line(),
            shorten(product.name, width=PrinterService.WIDTH, placeholder="..."),
            PrinterService._kv("SKU", product.sku),
            PrinterService._center(f"${PrinterService._decimal(product.sale_price):.2f}"),
            PrinterService._line(),
            PrinterService._center(f"BARCODE {code}"),
            "",
        ]
        return "\n".join(lines)

    @staticmethod
    def send_to_printer(content: str, printer_path: str | os.PathLike | None = None) -> bool:
        """Write ESC/POS bytes to the configured printer device/file.

        In production this can point at a raw device path, shared printer file,
        or spooler target. Tests can pass a normal file path.
        """
        target = printer_path or os.getenv("PRINTER_DEVICE_PATH")
        if not target:
            raise ValueError("Ruta de impresora no configurada")

        payload = b"\x1b@" + content.encode("cp437", errors="replace") + b"\n\x1di"
        Path(target).write_bytes(payload)
        return True

    @staticmethod
    def _line() -> str:
        return "-" * PrinterService.WIDTH

    @staticmethod
    def _center(value: str) -> str:
        return value[: PrinterService.WIDTH].center(PrinterService.WIDTH).rstrip()

    @staticmethod
    def _kv(label: str, value: str) -> str:
        label = str(label)
        value = str(value)
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
