"""Sale models: CashRegister, CashRegisterSession, Sale, SaleItem, Payment."""
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db


class CashRegister(db.Model):
    __tablename__ = "cash_registers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default="true")
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


class Sale(db.Model):
    __tablename__ = "sales"

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
        db.Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0"
    )

    sale = db.relationship("Sale", back_populates="items")
    product = db.relationship("Product")


class Payment(db.Model):
    __tablename__ = "payments"

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
    refund_total = db.Column(db.Numeric(12, 2), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    sale = db.relationship("Sale")
    user = db.relationship("User", foreign_keys=[user_id])
    items = db.relationship(
        "SaleReturnItem", back_populates="sale_return", cascade="all, delete-orphan"
    )


class SaleReturnItem(db.Model):
    __tablename__ = "sale_return_items"

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
