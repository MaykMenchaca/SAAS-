"""Purchases API — supplier CRUD and purchase order management."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models.purchase import PurchaseOrder, Supplier
from app.schemas.purchase import (
    CloseOrderSchema,
    PurchaseOrderCreateSchema,
    PurchaseOrderListSchema,
    PurchaseOrderSchema,
    ReceiveOrderSchema,
    SupplierCreateSchema,
    SupplierSchema,
    SupplierUpdateSchema,
)
from app.services.purchase_order_service import OrderNotFoundError, PurchaseOrderService
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
close_schema = CloseOrderSchema()


def _rfc_conflict(rfc, exclude_id=None):
    """409 claro si el RFC ya es de otro proveedor; si ese está inactivo, sugiere reactivarlo (RF-21)."""
    if not rfc:
        return None
    query = Supplier.query.filter(db.func.upper(db.func.trim(Supplier.rfc)) == rfc)
    if exclude_id is not None:
        query = query.filter(Supplier.id != exclude_id)
    other = query.first()
    if not other:
        return None
    if not other.is_active:
        return jsonify({
            "error": f"El RFC {rfc} es del proveedor '{other.name}', que está desactivado. "
                     "Reactívalo en lugar de darlo de alta de nuevo.",
            "code": "supplier_inactive",
            "supplier_id": other.id,
        }), 409
    return jsonify({
        "error": f"Ya existe un proveedor con el RFC {rfc}: '{other.name}'.",
        "code": "supplier_rfc_exists",
        "supplier_id": other.id,
    }), 409


# --- Supplier endpoints ---


@purchases_bp.route("/suppliers", methods=["POST"])
@require_permission("compras:crear")
def create_supplier():
    """Create a new supplier."""
    data = supplier_create_schema.load(request.get_json(silent=True) or {})
    conflict = _rfc_conflict(data.get("rfc"))
    if conflict:
        return conflict

    supplier = Supplier(**data)
    db.session.add(supplier)
    db.session.flush()

    from app.services.audit_service import log_action
    log_action(
        action="crear",
        entity_type="supplier",
        entity_id=supplier.id,
        details={"name": supplier.name},
        new_value={"name": supplier.name, "contact_name": supplier.contact_name, "rfc": supplier.rfc},
    )

    db.session.commit()

    return jsonify(supplier_schema.dump(supplier)), 201


@purchases_bp.route("/suppliers", methods=["GET"])
@require_permission("compras:ver")
def list_suppliers():
    """Proveedores activos paginados (H-45); con ?include_inactive=true también los desactivados (RF-21)."""
    query = Supplier.query
    if request.args.get("include_inactive", "false").lower() != "true":
        query = query.filter_by(is_active=True)
    query = query.order_by(Supplier.is_active.desc(), Supplier.name)
    return jsonify(paginate(query, suppliers_schema)), 200


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
    conflict = _rfc_conflict(data.get("rfc"), exclude_id=supplier.id)
    if conflict:
        return conflict

    # Solo los campos que cambian; un PATCH sin cambios no registra "editar" (RF-39)
    data = {key: value for key, value in data.items() if getattr(supplier, key) != value}
    if not data:
        return jsonify(supplier_schema.dump(supplier)), 200
    previous_value = {key: getattr(supplier, key) for key in data.keys()}
    for key, value in data.items():
        setattr(supplier, key, value)
    new_value = {key: getattr(supplier, key) for key in data.keys()}

    from app.services.audit_service import log_action
    log_action(
        action="editar",
        entity_type="supplier",
        entity_id=supplier.id,
        details={"name": supplier.name},
        previous_value=previous_value,
        new_value=new_value,
    )

    db.session.commit()

    return jsonify(supplier_schema.dump(supplier)), 200


@purchases_bp.route("/suppliers/<int:supplier_id>", methods=["DELETE"])
@require_permission("compras:editar")
def deactivate_supplier(supplier_id):
    """Deactivate a supplier (soft delete)."""
    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Proveedor no encontrado"}), 404
    if not supplier.is_active:
        # Un segundo DELETE registraba otro "desactivar" con el valor previo ya en False (RF-39)
        return jsonify(supplier_schema.dump(supplier)), 200

    prev_active = supplier.is_active
    supplier.is_active = False

    from app.services.audit_service import log_action
    log_action(
        action="desactivar",
        entity_type="supplier",
        entity_id=supplier.id,
        details={"name": supplier.name},
        previous_value={"is_active": prev_active},
        new_value={"is_active": False},
    )

    db.session.commit()

    return jsonify(supplier_schema.dump(supplier)), 200


@purchases_bp.route("/suppliers/<int:supplier_id>/reactivate", methods=["POST"])
@require_permission("compras:editar")
def reactivate_supplier(supplier_id):
    """Reactiva un proveedor desactivado (RF-21)."""
    supplier = db.session.get(Supplier, supplier_id)
    if not supplier:
        return jsonify({"error": "Proveedor no encontrado"}), 404
    if supplier.is_active:
        return jsonify(supplier_schema.dump(supplier)), 200  # ya estaba activo (RF-39)

    prev_active = supplier.is_active
    supplier.is_active = True

    from app.services.audit_service import log_action
    log_action(
        action="reactivar",
        entity_type="supplier",
        entity_id=supplier.id,
        details={"name": supplier.name},
        previous_value={"is_active": prev_active},
        new_value={"is_active": True},
    )

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
        # Acepta varios estados separados por coma (p. ej. "borrador,enviada,parcial" para la campana)
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        query = query.filter(PurchaseOrder.status.in_(statuses))

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
    except OrderNotFoundError as e:
        return jsonify({"error": str(e)}), 404  # RF-29
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(po_schema.dump(order)), 200


@purchases_bp.route("/orders/<int:order_id>/cancel", methods=["POST"])
@require_permission("compras:editar")
def cancel_order(order_id):
    """Cancel a purchase order."""
    try:
        order = PurchaseOrderService.cancel_order(order_id)
    except OrderNotFoundError as e:
        return jsonify({"error": str(e)}), 404  # RF-29
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(po_schema.dump(order)), 200


@purchases_bp.route("/orders/<int:order_id>/close", methods=["POST"])
@require_permission("compras:editar")
def close_order(order_id):
    """Cierra una orden parcial sin esperar lo pendiente; lo recibido se queda (RF-22)."""
    data = close_schema.load(request.get_json(silent=True) or {})
    try:
        order = PurchaseOrderService.close_order(order_id, int(get_jwt_identity()), notes=data.get("notes"))
    except OrderNotFoundError as e:
        return jsonify({"error": str(e)}), 404  # RF-29
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
    except OrderNotFoundError as e:
        return jsonify({"error": str(e)}), 404  # RF-29
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(po_schema.dump(order)), 200
