"""Cola de impresión para cajas con impresora USB local (OPS-03).

El agente de cada caja consulta al servidor y recibe los bytes ESC/POS ya armados. Los trabajos
caducan: un pulso de cajón viejo nunca se entrega, para que el cajón no se abra minutos después
de la venta (OPS-12).
"""
import hashlib
import hmac
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


def _hash_secret(secret: str) -> str:
    # El secreto es aleatorio de 256 bits: SHA-256 basta y es barato para un sondeo cada segundo
    return hashlib.sha256(secret.encode()).hexdigest()


def generate_agent_key(register: CashRegister) -> str:
    """Genera la clave del agente (formato <id>.<secreto>). Solo se guarda su hash."""
    secret = secrets.token_urlsafe(32)
    register.agent_key_hash = _hash_secret(secret)
    return f"{register.id}.{secret}"


def authenticate_agent(key: str | None) -> CashRegister | None:
    if not key or "." not in key:
        return None
    register_id, secret = key.split(".", 1)
    if not register_id.isdigit() or not secret:
        return None
    register = db.session.get(CashRegister, int(register_id))
    if not register or not register.is_active or not register.agent_key_hash:
        return None
    if not hmac.compare_digest(register.agent_key_hash, _hash_secret(secret)):
        return None
    return register


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
    now = timeutil.utc_now()
    register.agent_last_seen_at = now
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
    # Limpieza: los trabajos terminados hace más de 7 días ya no sirven
    PrintJob.query.filter(
        PrintJob.cash_register_id == register.id,
        PrintJob.status.in_(["impreso", "error", "caducado"]),
        PrintJob.created_at < now - timedelta(days=7),
    ).delete(synchronize_session=False)
    db.session.commit()
    return delivered


def report_result(register: CashRegister, job_id: int, ok: bool, error: str | None) -> PrintJob | None:
    job = db.session.get(PrintJob, job_id)
    if not job or job.cash_register_id != register.id:
        return None
    job.status = "impreso" if ok else "error"
    job.error = None if ok else (error or "Error de impresión")[:500]
    job.finished_at = timeutil.utc_now()
    db.session.commit()
    return job
