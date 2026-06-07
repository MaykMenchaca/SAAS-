"""Purchase models — Supplier, PurchaseOrder, and PurchaseOrderItem."""
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db


class Supplier(db.Model):
    __tablename__ = "suppliers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    rfc = db.Column(db.String(13), unique=True, nullable=True)
    contact_name = db.Column(db.String(150))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(120))
    address = db.Column(db.Text)
    payment_terms = db.Column(db.String(100))
    notes = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    purchase_orders = db.relationship(
        "PurchaseOrder", back_populates="supplier", lazy="dynamic"
    )


class PurchaseOrder(db.Model):
    """A purchase order to a supplier."""
    __tablename__ = "purchase_orders"

    id = db.Column(db.Integer, primary_key=True)
    folio = db.Column(db.String(20), unique=True, nullable=False, index=True)
    supplier_id = db.Column(
        db.Integer, db.ForeignKey("suppliers.id"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    status = db.Column(
        db.String(20),
        nullable=False,
        default="borrador",
        server_default="borrador",
    )  # borrador, enviada, parcial, recibida, cancelada
    subtotal = db.Column(db.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    tax_total = db.Column(db.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    total = db.Column(db.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    notes = db.Column(db.Text)
    expected_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    supplier = db.relationship("Supplier", back_populates="purchase_orders")
    user = db.relationship("User", foreign_keys=[user_id])
    items = db.relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan",
    )


class PurchaseOrderItem(db.Model):
    """A line item in a purchase order."""
    __tablename__ = "purchase_order_items"

    id = db.Column(db.Integer, primary_key=True)
    purchase_order_id = db.Column(
        db.Integer,
        db.ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.id"), nullable=False, index=True
    )
    product_name = db.Column(db.String(200), nullable=False)
    product_sku = db.Column(db.String(50), nullable=False)
    quantity = db.Column(db.Numeric(12, 3), nullable=False)
    received_quantity = db.Column(
        db.Numeric(12, 3),
        nullable=False,
        default=Decimal("0.000"),
        server_default="0",
    )
    unit_cost = db.Column(db.Numeric(12, 2), nullable=False)
    tax_rate = db.Column(db.Numeric(5, 2), nullable=False, default=Decimal("16.00"))
    subtotal = db.Column(db.Numeric(12, 2), nullable=False)

    purchase_order = db.relationship("PurchaseOrder", back_populates="items")
    product = db.relationship("Product")
