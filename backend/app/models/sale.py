"""Sale models: CashRegister, CashRegisterSession, Sale, SaleItem, Payment."""
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db


class CashRegister(db.Model):
    __tablename__ = "cash_registers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default="true")
    # Impresora de tickets de esta caja (ruta absoluta o puerto COM/LPT), configurada por el admin
    printer_path = db.Column(db.String(255), nullable=True)
    printer_codepage = db.Column(
        db.String(10), nullable=False, default="cp850", server_default="cp850"
    )
    # Impresora USB en la propia caja: el servidor encola y el agente local imprime (OPS-03)
    print_via_agent = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    agent_key_hash = db.Column(db.String(64), nullable=True)
    agent_last_seen_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    sessions = db.relationship(
        "CashRegisterSession", back_populates="cash_register", lazy="dynamic"
    )


class CashRegisterSession(db.Model):
    __tablename__ = "cash_register_sessions"
    __table_args__ = (
        # Una sola sesión abierta por caja, garantizado por la BD aunque dos aperturas compitan (H-31)
        db.Index(
            "uq_cash_session_open",
            "cash_register_id",
            unique=True,
            postgresql_where=db.text("status = 'abierta'"),
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    cash_register_id = db.Column(
        db.Integer, db.ForeignKey("cash_registers.id"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    opening_amount = db.Column(db.Numeric(12, 2), nullable=False)
    closing_amount = db.Column(db.Numeric(12, 2))
    expected_cash = db.Column(db.Numeric(12, 2))
    difference = db.Column(db.Numeric(12, 2))
    status = db.Column(
        db.String(20), nullable=False, default="abierta", server_default="abierta"
    )  # abierta, cerrada
    opened_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )
    closed_at = db.Column(db.DateTime(timezone=True))
    close_notes = db.Column(db.Text)

    cash_register = db.relationship("CashRegister", back_populates="sessions")
    user = db.relationship("User", foreign_keys=[user_id])
    sales = db.relationship("Sale", back_populates="session", lazy="dynamic")
    returns = db.relationship("SaleReturn", back_populates="session", lazy="dynamic")


class Sale(db.Model):
    __tablename__ = "sales"
    __table_args__ = (db.Index("ix_sales_created_at", "created_at"),)  # reportes por rango (H-33)

    id = db.Column(db.Integer, primary_key=True)
    folio = db.Column(db.String(20), unique=True, nullable=False, index=True)
    client_uuid = db.Column(db.String(36), unique=True, nullable=True, index=True)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey("cash_register_sessions.id"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    subtotal = db.Column(db.Numeric(12, 2), nullable=False)
    discount_total = db.Column(
        db.Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0"
    )
    tax_total = db.Column(db.Numeric(12, 2), nullable=False)
    total = db.Column(db.Numeric(12, 2), nullable=False)
    status = db.Column(
        db.String(20),
        nullable=False,
        default="completada",
        server_default="completada",
    )  # completada, cancelada
    cancelled_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    cancel_reason = db.Column(db.Text)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    session = db.relationship("CashRegisterSession", back_populates="sales")
    user = db.relationship("User", foreign_keys=[user_id])
    items = db.relationship(
        "SaleItem", back_populates="sale", cascade="all, delete-orphan"
    )
    payments = db.relationship(
        "Payment", back_populates="sale", cascade="all, delete-orphan"
    )


class SaleItem(db.Model):
    __tablename__ = "sale_items"

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(
        db.Integer,
        db.ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.id"), nullable=False, index=True
    )
    product_name = db.Column(db.String(200), nullable=False)
    product_sku = db.Column(db.String(50), nullable=False)
    quantity = db.Column(db.Numeric(12, 3), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    discount_percent = db.Column(
        db.Numeric(5, 2), nullable=False, default=Decimal("0.00"), server_default="0"
    )
    discount_amount = db.Column(
        db.Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0"
    )
    tax_rate = db.Column(db.Numeric(5, 2), nullable=False)
    subtotal = db.Column(db.Numeric(12, 2), nullable=False)
    cost_at_sale = db.Column(
        db.Numeric(12, 4), nullable=False, default=Decimal("0.00"), server_default="0"
    )  # misma precisión que products.avg_cost

    sale = db.relationship("Sale", back_populates="items")
    product = db.relationship("Product")


class Payment(db.Model):
    __tablename__ = "payments"
    __table_args__ = (
        db.CheckConstraint("amount > 0", name="ck_payments_amount_pos"),
        db.CheckConstraint("change_amount >= 0", name="ck_payments_change_nonneg"),
    )

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(
        db.Integer,
        db.ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    method = db.Column(
        db.String(30), nullable=False
    )  # efectivo, tarjeta, transferencia
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    reference = db.Column(db.String(100))
    change_amount = db.Column(
        db.Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0"
    )

    sale = db.relationship("Sale", back_populates="payments")


class SaleReturn(db.Model):
    __tablename__ = "sale_returns"

    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(
        db.Integer, db.ForeignKey("sales.id"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    reason = db.Column(db.Text, nullable=False)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey("cash_register_sessions.id"),
        nullable=True,
        index=True,
    )
    refund_method = db.Column(
        db.String(30),
        nullable=False,
        default="efectivo",
        server_default="efectivo",
    )  # efectivo, tarjeta, transferencia
    refund_total = db.Column(db.Numeric(12, 2), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    sale = db.relationship("Sale")
    user = db.relationship("User", foreign_keys=[user_id])
    session = db.relationship("CashRegisterSession", back_populates="returns")
    items = db.relationship(
        "SaleReturnItem", back_populates="sale_return", cascade="all, delete-orphan"
    )


class SaleReturnItem(db.Model):
    __tablename__ = "sale_return_items"
    __table_args__ = (db.Index("ix_sale_return_items_sale_item_id", "sale_item_id"),)

    id = db.Column(db.Integer, primary_key=True)
    sale_return_id = db.Column(
        db.Integer,
        db.ForeignKey("sale_returns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sale_item_id = db.Column(
        db.Integer, db.ForeignKey("sale_items.id"), nullable=False
    )
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.id"), nullable=False
    )
    quantity = db.Column(db.Numeric(12, 3), nullable=False)
    refund_amount = db.Column(db.Numeric(12, 2), nullable=False)

    sale_return = db.relationship("SaleReturn", back_populates="items")
    sale_item = db.relationship("SaleItem")
