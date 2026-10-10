"""Cola de impresión para los agentes locales de cada caja (OPS-03)."""
from datetime import datetime, timezone

from app.extensions import db


class PrintJob(db.Model):
    __tablename__ = "print_jobs"

    id = db.Column(db.Integer, primary_key=True)
    cash_register_id = db.Column(
        db.Integer, db.ForeignKey("cash_registers.id"), nullable=False, index=True
    )
    kind = db.Column(db.String(20), nullable=False)  # ticket, drawer
    payload = db.Column(db.LargeBinary, nullable=False)  # bytes ESC/POS listos para la impresora
    # pendiente -> entregado -> impreso | error; pendiente -> caducado
    status = db.Column(
        db.String(20), nullable=False, default="pendiente", server_default="pendiente", index=True
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    delivered_at = db.Column(db.DateTime(timezone=True))
    finished_at = db.Column(db.DateTime(timezone=True))
    error = db.Column(db.Text)

    cash_register = db.relationship("CashRegister")
