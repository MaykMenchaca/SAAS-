"""Purchases API — supplier CRUD and purchase order management."""
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models.purchase import Supplier
from app.schemas.purchase import (
    SupplierCreateSchema,
    SupplierSchema,
    SupplierUpdateSchema,
)
from app.utils.decorators import require_permission

purchases_bp = Blueprint("purchases", __name__)

supplier_create_schema = SupplierCreateSchema()
supplier_update_schema = SupplierUpdateSchema()
supplier_schema = SupplierSchema()
suppliers_schema = SupplierSchema(many=True)


# --- Supplier endpoints ---


@purchases_bp.route("/suppliers", methods=["POST"])
@require_permission("compras:crear")
def create_supplier():
    """Create a new supplier."""
    data = supplier_create_schema.load(request.get_json(silent=True) or {})

    supplier = Supplier(**data)
    db.session.add(supplier)
    db.session.commit()

    return jsonify(supplier_schema.dump(supplier)), 201


@purchases_bp.route("/suppliers", methods=["GET"])
@require_permission("compras:ver")
def list_suppliers():
    """List all active suppliers."""
    suppliers = (
        Supplier.query
        .filter_by(is_active=True)
        .order_by(Supplier.name)
        .all()
    )
    return jsonify(suppliers_schema.dump(suppliers)), 200


@purchases_bp.route("/suppliers/<int:supplier_id>", methods=["GET"])
@require_permission("compras:ver")
def get_supplier(supplier_id):
    """Get a supplier by ID."""
    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Proveedor no encontrado"}), 404
    return jsonify(supplier_schema.dump(supplier)), 200


@purchases_bp.route("/suppliers/<int:supplier_id>", methods=["PATCH"])
@require_permission("compras:editar")
def update_supplier(supplier_id):
    """Update a supplier."""
    data = supplier_update_schema.load(request.get_json(silent=True) or {})

    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Proveedor no encontrado"}), 404

    for key, value in data.items():
        setattr(supplier, key, value)

    db.session.commit()

    return jsonify(supplier_schema.dump(supplier)), 200


@purchases_bp.route("/suppliers/<int:supplier_id>", methods=["DELETE"])
@require_permission("compras:editar")
def deactivate_supplier(supplier_id):
    """Deactivate a supplier (soft delete)."""
    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Proveedor no encontrado"}), 404

    supplier.is_active = False
    db.session.commit()

    return jsonify(supplier_schema.dump(supplier)), 200
