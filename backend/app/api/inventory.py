"""Inventory API — stock consultation, adjustments, and movement history."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.extensions import db
from app.models.inventory import Stock, StockMovement
from app.models.product import Product
from app.schemas.inventory import (
    StockAdjustSchema,
    StockMovementSchema,
    StockSchema,
)
from app.services.inventory_service import InventoryService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate

inventory_bp = Blueprint("inventory", __name__)

stock_schema = StockSchema()
stocks_schema = StockSchema(many=True)
movement_schema = StockMovementSchema()
movements_schema = StockMovementSchema(many=True)
adjust_schema = StockAdjustSchema()


@inventory_bp.route("/stock", methods=["GET"])
@require_permission("inventario:ver")
def list_stock():
    """List all stock records, optionally filtered by product name/SKU."""
    search = request.args.get("search") or request.args.get("q")

    query = (
        Stock.query
        .join(Product)
        .filter(Product.is_active.is_(True))
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
