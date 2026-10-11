"""Service for managing system configuration key-value pairs."""
from app.extensions import db
from app.models.config import DEFAULTS, SystemConfig


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
