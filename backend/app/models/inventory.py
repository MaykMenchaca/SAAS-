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
