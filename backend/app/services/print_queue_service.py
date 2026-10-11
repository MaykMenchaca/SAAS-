"""Cola de impresión para cajas con impresora USB local (OPS-03).

El agente de cada caja consulta al servidor y recibe los bytes ESC/POS ya armados. Los trabajos
caducan: un pulso de cajón viejo nunca se entrega, para que el cajón no se abra minutos después
de la venta (OPS-12). Cada trabajo se entrega una sola vez; si el agente no confirma en
UNCONFIRMED_AFTER, pasa a error para que quede rastro (OPS-17).
"""
import hashlib
import hmac
import re
import secrets
from datetime import timedelta

from app.extensions import db
from app.models.printing import PrintJob
from app.models.sale import CashRegister
from app.utils import timeutil

JOB_TTL = {
    "drawer": timedelta(seconds=30),
    "ticket": timedelta(minutes=10),
}
UNCONFIRMED_AFTER = timedelta(minutes=2)
LAST_SEEN_RESOLUTION = timedelta(seconds=10)
AGENT_ONLINE_WINDOW = timedelta(seconds=15)
PURGE_AFTER = timedelta(days=7)
PURGE_EVERY = timedelta(hours=1)

_KEY_RE = re.compile(r"(\d{1,9})\.([A-Za-z0-9_-]{16,})")
_last_purge = None


class InvalidTransition(Exception):
    """El trabajo ya no está esperando confirmación (resultado duplicado o tardío)."""


def _hash_secret(secret: str) -> str:
    # El secreto es aleatorio de 256 bits: SHA-256 basta y es barato para un sondeo cada segundo
    return hashlib.sha256(secret.encode()).hexdigest()


def generate_agent_key(register: CashRegister) -> str:
    """Genera la clave del agente (formato <id>.<secreto>). Solo se guarda su hash."""
    secret = secrets.token_urlsafe(32)
    register.agent_key_hash = _hash_secret(secret)
    return f"{register.id}.{secret}"


def authenticate_agent(key: str | None) -> CashRegister | None:
    # fullmatch con [0-9] ASCII: "².x" o claves mal formadas son 401, nunca 500 (OPS-22)
    match = _KEY_RE.fullmatch(key or "")
    if not match:
        return None
    register = db.session.get(CashRegister, int(match[1]))
    if not register or not register.is_active or not register.agent_key_hash:
        return None
    if not hmac.compare_digest(register.agent_key_hash, _hash_secret(match[2])):
        return None
    return register


def agent_online(register: CashRegister) -> bool:
    seen = register.agent_last_seen_at
    return seen is not None and timeutil.utc_now() - seen < AGENT_ONLINE_WINDOW


def enqueue(register_id: int, kind: str, payload: bytes) -> PrintJob:
    """Encola un trabajo y lo confirma en su propia transacción (se llama después de la venta)."""
    job = PrintJob(
        cash_register_id=register_id,
        kind=kind,
        payload=payload,
        expires_at=timeutil.utc_now() + JOB_TTL.get(kind, JOB_TTL["ticket"]),
    )
    db.session.add(job)
    db.session.commit()
    return job


def claim_jobs(register: CashRegister, limit: int = 20) -> list[PrintJob]:
    """Entrega los trabajos pendientes de la caja una sola vez; marca caducados los vencidos."""
    global _last_purge
    now = timeutil.utc_now()

    # Escribir "visto" solo cada 10 s: el sondeo es cada segundo por caja (OPS-21)
    if register.agent_last_seen_at is None or now - register.agent_last_seen_at >= LAST_SEEN_RESOLUTION:
        register.agent_last_seen_at = now

    # Entregados que nunca se confirmaron (agente caído a la mitad, red cortada): quedan como error
    PrintJob.query.filter(
        PrintJob.cash_register_id == register.id,
        PrintJob.status == "entregado",
        PrintJob.delivered_at < now - UNCONFIRMED_AFTER,
    ).update(
        {"status": "error", "error": "Sin confirmación del agente de impresión", "finished_at": now},
        synchronize_session=False,
    )

    pending = (
        PrintJob.query.filter_by(cash_register_id=register.id, status="pendiente")
        .order_by(PrintJob.id)
        .with_for_update(skip_locked=True)
        .limit(limit)
        .all()
    )
    delivered = []
    for job in pending:
        if job.expires_at <= now:
            job.status = "caducado"
            job.finished_at = now
            continue
        job.status = "entregado"
        job.delivered_at = now
        delivered.append(job)

    # Limpieza ocasional de trabajos viejos (una vez por hora por proceso)
    if _last_purge is None or now - _last_purge >= PURGE_EVERY:
        PrintJob.query.filter(
            PrintJob.status.in_(["impreso", "error", "caducado"]),
            PrintJob.created_at < now - PURGE_AFTER,
        ).delete(synchronize_session=False)
        _last_purge = now

    db.session.commit()
    return delivered


def seconds_left(job: PrintJob) -> int:
    return max(0, int((job.expires_at - timeutil.utc_now()).total_seconds()))


def report_result(register: CashRegister, job_id: int, ok: bool, error: str | None) -> PrintJob | None:
    job = db.session.query(PrintJob).filter_by(id=job_id).with_for_update().first()
    if not job or job.cash_register_id != register.id:
        return None
    if job.status != "entregado":
        db.session.rollback()
        raise InvalidTransition(job.status)
    job.status = "impreso" if ok else "error"
    job.error = None if ok else (error or "Error de impresión")[:500]
    job.finished_at = timeutil.utc_now()
    db.session.commit()
    return job
