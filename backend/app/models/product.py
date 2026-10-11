from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (
        # Nombres únicos sin distinguir mayúsculas ni espacios (H-54)
        db.Index("uq_categories_name_ci", db.text("lower(trim(name))"), unique=True),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(200))
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default="true")
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=db.func.now(),
    )

    products = db.relationship("Product", back_populates="category", lazy="dynamic")


class UnitOfMeasure(db.Model):
    __tablename__ = "units_of_measure"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    abbreviation = db.Column(db.String(10), nullable=False)
    allows_fractions = db.Column(db.Boolean, nullable=False, default=False, server_default="false")

    products = db.relationship("Product", back_populates="unit", lazy="dynamic")


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(50), unique=True, nullable=False, index=True)
    barcode = db.Column(db.String(100), unique=True, nullable=True, index=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    description = db.Column(db.Text)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey("units_of_measure.id"), nullable=False)
    purchase_price = db.Column(
        db.Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0",
    )
    avg_cost = db.Column(
        db.Numeric(12, 4),  # 4 decimales: el promedio ponderado no pierde precisión por recepción (H-31)
        nullable=False,
        default=Decimal("0.00"),
        server_default="0",
    )
    sale_price = db.Column(db.Numeric(12, 2), nullable=False)
    tax_rate = db.Column(
        db.Numeric(5, 2),
        nullable=False,
        default=Decimal("16.00"),
        server_default="16.00",
    )
    min_stock = db.Column(
        db.Numeric(12, 3),
        nullable=False,
        default=Decimal("0.000"),
        server_default="0",
    )
    max_stock = db.Column(
        db.Numeric(12, 3),
        nullable=False,
        default=Decimal("0.000"),
        server_default="0",
    )
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default="true", index=True)
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

    category = db.relationship("Category", back_populates="products")
    unit = db.relationship("UnitOfMeasure", back_populates="products")
