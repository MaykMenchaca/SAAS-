"""Inventory API — stock consultation, adjustments, movement history, and physical counts."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models.inventory import InventoryCount, Stock
from app.models.product import Product
from app.schemas.inventory import (
    InventoryCountCaptureSchema,
    InventoryCountCreateSchema,
    InventoryCountItemSchema,
    InventoryCountListSchema,
    InventoryCountSchema,
    StockAdjustSchema,
    StockMovementSchema,
    StockSchema,
)
from app.services.inventory_count_service import InventoryCountService
from app.services.inventory_service import InventoryService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate

inventory_bp = Blueprint("inventory", __name__)

stock_schema = StockSchema()
stocks_schema = StockSchema(many=True)
movements_schema = StockMovementSchema(many=True)
adjust_schema = StockAdjustSchema()
count_create_schema = InventoryCountCreateSchema()
count_capture_schema = InventoryCountCaptureSchema()
count_schema = InventoryCountSchema()
count_item_schema = InventoryCountItemSchema()
count_list_schema = InventoryCountListSchema(many=True)


@inventory_bp.route("/stock", methods=["GET"])
@require_permission("inventario:ver")
def list_stock():
    """List all stock records, optionally filtered by product name/SKU."""
    search = request.args.get("search") or request.args.get("q")

    # Un producto desactivado con existencias sigue contando en inventario (H-43)
    query = (
        Stock.query
        .join(Product)
        .filter(db.or_(Product.is_active.is_(True), Stock.quantity != 0))
        .order_by(Product.name)
    )

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(
                Product.name.ilike(pattern),
                Product.sku.ilike(pattern),
                Product.barcode.ilike(pattern),
            )
        )

    return jsonify(paginate(query, stocks_schema)), 200


@inventory_bp.route("/stock/<int:product_id>", methods=["GET"])
@require_permission("inventario:ver")
def get_stock(product_id):
    """Get current stock for a specific product."""
    stock = Stock.query.filter_by(product_id=product_id).first()
    if not stock:
        return jsonify({"error": "Stock no encontrado para este producto"}), 404
    return jsonify(stock_schema.dump(stock)), 200


@inventory_bp.route("/low-stock", methods=["GET"])
@require_permission("inventario:ver")
def low_stock():
    """List products whose stock is below their min_stock threshold."""
    results = (
        Stock.query
        .join(Product)
        .filter(
            Product.is_active.is_(True),
            Product.min_stock > 0,
            Stock.quantity < Product.min_stock,
        )
        .order_by(Stock.quantity.asc())
        .all()
    )
    return jsonify(stocks_schema.dump(results)), 200


@inventory_bp.route("/adjust", methods=["POST"])
@require_permission("inventario:ajustar")
def adjust_stock():
    """Perform a manual stock adjustment (set to exact quantity)."""
    data = adjust_schema.load(request.get_json(silent=True) or {})

    product = db.session.get(Product, data["product_id"])
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404

    user_id = int(get_jwt_identity())

    stock = InventoryService.move_stock(
        product_id=data["product_id"],
        quantity=data["quantity"],
        movement_type="ajuste",
        reference_type="ajuste_manual",
        reference_id=0,
        user_id=user_id,
        notes=data.get("notes"),
    )

    from app.services.audit_service import log_action
    log_action(
        action="adjust",
        entity_type="stock",
        entity_id=stock.id,
        details={
            "product_id": stock.product_id,
            "product_name": product.name,
            "new_stock": str(stock.quantity),
            "notes": data.get("notes"),
        },
        user_id=user_id,
    )

    db.session.commit()

    return jsonify({
        "product_id": stock.product_id,
        "new_stock": str(stock.quantity),
        "movement_type": "ajuste",
    }), 200


@inventory_bp.route("/movements/<int:product_id>", methods=["GET"])
@require_permission("inventario:ver")
def list_movements(product_id):
    """List stock movements for a specific product."""
    limit = request.args.get("limit", 50, type=int)
    limit = min(limit, 200)

    movements = InventoryService.get_movements(product_id, limit=limit)
    return jsonify(movements_schema.dump(movements)), 200


# --- Physical Inventory Count ---


@inventory_bp.route("/counts", methods=["POST"])
@require_permission("inventario:ajustar")
def create_count():
    """Create a new physical inventory count, pre-populated with all active products."""
    data = count_create_schema.load(request.get_json(silent=True) or {})
    user_id = int(get_jwt_identity())

    try:
        count = InventoryCountService.create_count(
            user_id=user_id,
            notes=data.get("notes"),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_schema.dump(count)), 201


@inventory_bp.route("/counts", methods=["GET"])
@require_permission("inventario:ver")
def list_counts():
    """List inventory counts with pagination."""
    query = InventoryCount.query.order_by(InventoryCount.created_at.desc())
    return jsonify(paginate(query, count_list_schema)), 200


@inventory_bp.route("/counts/<int:count_id>", methods=["GET"])
@require_permission("inventario:ver")
def get_count(count_id):
    """Get inventory count detail including all items."""
    count = InventoryCountService.get_count(count_id)
    if not count:
        return jsonify({"error": "Conteo no encontrado"}), 404
    return jsonify(count_schema.dump(count)), 200


@inventory_bp.route("/counts/<int:count_id>/items/<int:product_id>", methods=["PATCH"])
@require_permission("inventario:ajustar")
def capture_count_item(count_id, product_id):
    """Record the physical count for a specific product in a count."""
    data = count_capture_schema.load(request.get_json(silent=True) or {})
    try:
        item = InventoryCountService.capture_item(
            count_id=count_id,
            product_id=product_id,
            counted_quantity=data["counted_quantity"],
            notes=data.get("notes"),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_item_schema.dump(item)), 200


@inventory_bp.route("/counts/<int:count_id>/close", methods=["POST"])
@require_permission("inventario:ajustar")
def close_count(count_id):
    """Close a count and auto-adjust stock for items with differences."""
    user_id = int(get_jwt_identity())
    try:
        count = InventoryCountService.close_count(count_id, user_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_schema.dump(count)), 200


@inventory_bp.route("/counts/<int:count_id>/cancel", methods=["POST"])
@require_permission("inventario:ajustar")
def cancel_count(count_id):
    """Cancel a count without applying any adjustments."""
    user_id = int(get_jwt_identity())
    try:
        count = InventoryCountService.cancel_count(count_id, user_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_schema.dump(count)), 200
