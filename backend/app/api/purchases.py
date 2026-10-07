"""Purchases API — supplier CRUD and purchase order management."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models.purchase import PurchaseOrder, Supplier
from app.schemas.purchase import (
    PurchaseOrderCreateSchema,
    PurchaseOrderListSchema,
    PurchaseOrderSchema,
    ReceiveOrderSchema,
    SupplierCreateSchema,
    SupplierSchema,
    SupplierUpdateSchema,
)
from app.services.purchase_order_service import PurchaseOrderService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate

purchases_bp = Blueprint("purchases", __name__)

supplier_create_schema = SupplierCreateSchema()
supplier_update_schema = SupplierUpdateSchema()
supplier_schema = SupplierSchema()
suppliers_schema = SupplierSchema(many=True)
po_create_schema = PurchaseOrderCreateSchema()
po_schema = PurchaseOrderSchema()
po_list_schema = PurchaseOrderListSchema(many=True)
receive_schema = ReceiveOrderSchema()


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


# --- Purchase Order endpoints ---


@purchases_bp.route("/orders", methods=["POST"])
@require_permission("compras:crear")
def create_order():
    """Create a new purchase order."""
    data = po_create_schema.load(request.get_json(silent=True) or {})
    user_id = int(get_jwt_identity())

    try:
        order = PurchaseOrderService.create_order(
            user_id=user_id,
            supplier_id=data.get("supplier_id"),
            items=data["items"],
            notes=data.get("notes"),
            expected_date=data.get("expected_date"),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(po_schema.dump(order)), 201


@purchases_bp.route("/orders", methods=["GET"])
@require_permission("compras:ver")
def list_orders():
    """List purchase orders with pagination."""
    query = PurchaseOrder.query.order_by(PurchaseOrder.created_at.desc())

    status = request.args.get("status")
    if status:
        query = query.filter(PurchaseOrder.status == status)

    return jsonify(paginate(query, po_list_schema)), 200


@purchases_bp.route("/orders/<int:order_id>", methods=["GET"])
@require_permission("compras:ver")
def get_order(order_id):
    """Get purchase order detail including items."""
    order = PurchaseOrderService.get_order(order_id)
    if not order:
        return jsonify({"error": "Orden de compra no encontrada"}), 404
    return jsonify(po_schema.dump(order)), 200


@purchases_bp.route("/orders/<int:order_id>/send", methods=["POST"])
@require_permission("compras:editar")
def send_order(order_id):
    """Mark a draft order as sent."""
    try:
        order = PurchaseOrderService.send_order(order_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(po_schema.dump(order)), 200


@purchases_bp.route("/orders/<int:order_id>/cancel", methods=["POST"])
@require_permission("compras:editar")
def cancel_order(order_id):
    """Cancel a purchase order."""
    try:
        order = PurchaseOrderService.cancel_order(order_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(po_schema.dump(order)), 200


@purchases_bp.route("/orders/<int:order_id>/receive", methods=["POST"])
@require_permission("compras:recibir")
def receive_order(order_id):
    """Receive items for a purchase order, updating inventory and avg cost."""
    data = receive_schema.load(request.get_json(silent=True) or {})
    user_id = int(get_jwt_identity())

    try:
        order = PurchaseOrderService.receive_order(
            order_id=order_id,
            user_id=user_id,
            items=data["items"],
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(po_schema.dump(order)), 200
