"""System configuration model — key-value store for app settings."""
from datetime import datetime, timezone

from app.extensions import db


class SystemConfig(db.Model):
    __tablename__ = "system_config"

    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, nullable=False)
    description = db.Column(db.String(300), nullable=True)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


# Default configuration values (inserted on seed)
DEFAULTS = {
    "company_name": ("Mi Negocio", "Nombre de la empresa"),
    "company_address": ("", "Direccion de la empresa"),
    "company_phone": ("", "Telefono de la empresa"),
    "default_tax_rate": ("16.00", "Tasa de IVA por defecto (%)"),
    "low_stock_threshold": ("10", "Umbral global de stock bajo"),
    "ticket_footer": ("Gracias por su compra", "Texto al pie del ticket"),
    "currency_symbol": ("$", "Simbolo de moneda"),
    "allow_negative_stock": ("false", "Permitir ventas con stock negativo"),
    "max_discount_percent": ("0", "Porcentaje maximo de descuento permitido a cajeros sin permiso especial"),
}
