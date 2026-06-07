"""Inventory models: Stock (current quantity) and StockMovement (history)."""
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db


class Stock(db.Model):
    __tablename__ = "stock"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id"),
        unique=True,
        nullable=False,
        index=True,
    )
    quantity = db.Column(
        db.Numeric(12, 3),
        nullable=False,
        default=Decimal("0.000"),
        server_default="0",
    )
    last_updated = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    product = db.relationship("Product", backref=db.backref("stock", uselist=False))


class StockMovement(db.Model):
    __tablename__ = "stock_movements"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id"),
        nullable=False,
        index=True,
    )
    movement_type = db.Column(
        db.String(20),
        nullable=False,
    )  # entrada, salida, ajuste
    quantity = db.Column(db.Numeric(12, 3), nullable=False)
    previous_stock = db.Column(db.Numeric(12, 3), nullable=False)
    new_stock = db.Column(db.Numeric(12, 3), nullable=False)
    reference_type = db.Column(db.String(50))  # venta, compra, ajuste_manual, cancelacion, devolucion, conteo
    reference_id = db.Column(db.Integer)
    notes = db.Column(db.Text)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    product = db.relationship("Product")
    user = db.relationship("User")


class InventoryCount(db.Model):
    """A physical inventory count session."""
    __tablename__ = "inventory_counts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    status = db.Column(
        db.String(20),
        nullable=False,
        default="pendiente",
        server_default="pendiente",
    )  # pendiente, en_proceso, cerrado, cancelado
    notes = db.Column(db.Text)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )
    closed_at = db.Column(db.DateTime(timezone=True))
    closed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    user = db.relationship("User", foreign_keys=[user_id])
    closer = db.relationship("User", foreign_keys=[closed_by])
    items = db.relationship(
        "InventoryCountItem",
        back_populates="inventory_count",
        cascade="all, delete-orphan",
    )


class InventoryCountItem(db.Model):
    """A single product line in a physical inventory count."""
    __tablename__ = "inventory_count_items"

    id = db.Column(db.Integer, primary_key=True)
    inventory_count_id = db.Column(
        db.Integer,
        db.ForeignKey("inventory_counts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.id"), nullable=False, index=True
    )
    expected_quantity = db.Column(db.Numeric(12, 3), nullable=False)
    counted_quantity = db.Column(db.Numeric(12, 3), nullable=True)
    difference = db.Column(db.Numeric(12, 3), nullable=True)
    notes = db.Column(db.Text)

    inventory_count = db.relationship("InventoryCount", back_populates="items")
    product = db.relationship("Product")
