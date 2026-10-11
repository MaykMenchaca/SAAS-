"""Fechas y horas en la zona horaria de la tienda (APP_TIMEZONE).

La base de datos guarda `timestamptz` en UTC; los días de negocio (reportes,
dashboard, folios, nombres de respaldo) se calculan en la hora local de la tienda.
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app, has_app_context

DEFAULT_TIMEZONE = "America/Mexico_City"


def app_tz() -> ZoneInfo:
    """Zona horaria de la tienda, tomada de `APP_TIMEZONE`."""
    name = DEFAULT_TIMEZONE
    if has_app_context():
        name = current_app.config.get("APP_TIMEZONE") or DEFAULT_TIMEZONE
    return ZoneInfo(name)


def utc_now() -> datetime:
    """Hora actual en UTC. Único punto de lectura del reloj (los tests lo sustituyen)."""
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    """Hora actual en la zona de la tienda."""
    return utc_now().astimezone(app_tz())


def local_today() -> date:
    """Fecha de hoy en la zona de la tienda."""
    return local_now().date()


def to_local(dt: datetime) -> datetime:
    """Convierte un datetime a la zona de la tienda. Un datetime sin zona se toma como UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(app_tz())


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Límites en UTC del día local: intervalo semiabierto [inicio, fin)."""
    tz = app_tz()
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


class InvalidDateError(ValueError):
    """Fecha de un parámetro con formato inválido: la API responde 400 (H-32)."""


def parse_local_date(value: str) -> date:
    """Parsea `YYYY-MM-DD`. Lanza InvalidDateError (400) con mensaje en español si es inválida."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise InvalidDateError(f"Fecha inválida: '{value}'. Usa el formato AAAA-MM-DD")
