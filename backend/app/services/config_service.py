"""Service for managing system configuration key-value pairs."""
from decimal import Decimal, InvalidOperation

from app.extensions import db
from app.models.config import DEFAULTS, SystemConfig


class ConfigValidationError(ValueError):
    """Valores de configuración inválidos; `details` = {clave: [mensajes]}."""

    def __init__(self, details: dict):
        super().__init__("Valores de configuración inválidos")
        self.details = details


def _decimal(minimum, maximum=None, places=2):
    def check(value):
        try:
            dec = Decimal(str(value).strip())
        except (InvalidOperation, ValueError):
            raise ValueError("Debe ser un número") from None
        if not dec.is_finite():
            raise ValueError("Debe ser un número")
        if dec < minimum or (maximum is not None and dec > maximum):
            rango = f"entre {minimum} y {maximum}" if maximum is not None else f"mayor o igual a {minimum}"
            raise ValueError(f"Debe estar {rango}")
        return str(dec.quantize(Decimal(1).scaleb(-places)))
    return check


def _texto(max_len, required=False):
    def check(value):
        text = str(value).strip()
        if required and not text:
            raise ValueError("No puede estar vacío")
        if len(text) > max_len:
            raise ValueError(f"Máximo {max_len} caracteres")
        return text
    return check


def _booleano(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    text = str(value).strip().lower()
    if text in ("true", "false"):
        return text
    raise ValueError("Debe ser true o false")


# Claves que se pueden escribir y cómo se validan (RF-06). Antes se guardaba str(valor) de cualquier cosa:
# un tope de descuento "NaN" detenía todas las ventas y "150" permitía regalar mercancía
VALIDATORS = {
    "company_name": _texto(120, required=True),
    "company_subtitle": _texto(120),
    "company_address": _texto(255),
    "company_phone": _texto(40),
    "company_rfc": _texto(13),
    "company_logo_icon": _texto(50),
    "company_logo_color": _texto(30),
    "logo_url": _texto(500),
    "ticket_footer": _texto(500),
    "currency_symbol": _texto(5, required=True),
    "default_tax_rate": _decimal(Decimal("0"), Decimal("100")),
    "max_discount_percent": _decimal(Decimal("0"), Decimal("100")),
    "low_stock_threshold": _decimal(Decimal("0"), None, places=3),
    "allow_negative_stock": _booleano,
}
# Nombres anteriores que el ticket y el branding siguen leyendo como respaldo
VALIDATORS.update({
    "business_name": VALIDATORS["company_name"],
    "business_address": VALIDATORS["company_address"],
    "business_phone": VALIDATORS["company_phone"],
    "business_rfc": VALIDATORS["company_rfc"],
})


def validate_updates(updates) -> dict:
    """Valida y normaliza un PUT de configuración. Lanza ConfigValidationError con el detalle por clave.

    Una clave desconocida que ya existe y llega SIN cambios se ignora (la pantalla reenvía todas las claves que
    recibió); una clave desconocida nueva o modificada se rechaza.
    """
    if not isinstance(updates, dict) or not updates:
        raise ConfigValidationError({"_schema": ["Se esperaba un objeto con valores"]})
    clean, errors = {}, {}
    for key, value in updates.items():
        if not isinstance(key, str) or len(key) > 100:
            errors[str(key)[:100]] = ["Clave inválida"]
            continue
        if value is None or isinstance(value, (dict, list)):
            errors[key] = ["Valor inválido"]
            continue
        validator = VALIDATORS.get(key)
        if validator is None:
            row = db.session.get(SystemConfig, key)
            if row is not None and row.value == str(value):
                continue
            errors[key] = ["Clave de configuración desconocida"]
            continue
        try:
            clean[key] = validator(value)
        except ValueError as exc:
            errors[key] = [str(exc)]
    if errors:
        raise ConfigValidationError(errors)
    return clean


def max_discount_percent() -> Decimal:
    """Tope de descuento sin permiso especial. Un valor dañado (anterior a la validación) cuenta como 0."""
    try:
        value = Decimal(str(get("max_discount_percent") or "0"))
    except (InvalidOperation, ValueError):
        return Decimal("0")
    if not value.is_finite() or value < 0 or value > 100:
        return Decimal("0")
    return value


def get_all() -> dict:
    """Return all config entries as a dict, filling defaults for missing keys."""
    rows = SystemConfig.query.all()
    result = {}
    existing_keys = set()
    for row in rows:
        result[row.key] = row.value
        existing_keys.add(row.key)

    # Fill in defaults for keys not yet in the DB
    for key, (default_value, _desc) in DEFAULTS.items():
        if key not in existing_keys:
            result[key] = default_value

    return result


def get(key: str) -> str | None:
    """Get a single config value by key, falling back to default."""
    row = db.session.get(SystemConfig, key)
    if row:
        return row.value
    if key in DEFAULTS:
        return DEFAULTS[key][0]
    return None


def first_configured(*keys: str, default: str = "") -> str:
    """Primer valor GUARDADO y no vacío entre `keys`; si ninguno, `default`.

    No usa los valores por omisión de DEFAULTS: así una clave nueva sin guardar (``company_name`` =
    "Mi Negocio") no tapa la clave anterior que sí se configuró (``business_name``) (RF-43).
    """
    for key in keys:
        row = db.session.get(SystemConfig, key)
        if row is not None and row.value and row.value.strip():
            return row.value.strip()
    return default


def set_value(key: str, value: str) -> SystemConfig:
    """Set a config value (upsert)."""
    row = db.session.get(SystemConfig, key)
    if row:
        row.value = value
    else:
        description = DEFAULTS.get(key, (None, None))[1]
        row = SystemConfig(key=key, value=value, description=description)
        db.session.add(row)
    db.session.flush()
    return row


def set_bulk(updates: dict) -> dict:
    """Set multiple config values at once, auditado en la misma transacción. Returns all config."""
    from app.services.audit_service import log_action

    updates = validate_updates(updates)
    if not updates:
        return get_all()
    previous = {key: get(key) for key in updates}
    for key, value in updates.items():
        set_value(key, str(value))
    # Antes del commit: el registro de auditoría se guarda junto con el cambio (H-09)
    log_action(
        action="update",
        entity_type="config",
        details={"updated_keys": list(updates.keys())},
        previous_value=previous,
        new_value={key: str(value) for key, value in updates.items()},
    )
    db.session.commit()
    return get_all()


def seed_defaults():
    """Insert default config entries if they don't exist yet."""
    for key, (default_value, description) in DEFAULTS.items():
        existing = db.session.get(SystemConfig, key)
        if not existing:
            db.session.add(
                SystemConfig(key=key, value=default_value, description=description)
            )
    db.session.commit()
