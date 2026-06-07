"""Sales API — create, cancel, list, and detail sales."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.schemas.sale import (
    SaleCancelSchema,
    SaleCreateSchema,
    SaleListSchema,
    SaleReturnCreateSchema,
    SaleReturnSchema,
    SaleSchema,
)
from app.services.sale_service import SaleService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate
from app.models.sale import Sale

sales_bp = Blueprint("sales", __name__)

sale_create_schema = SaleCreateSchema()
sale_cancel_schema = SaleCancelSchema()
sale_return_create_schema = SaleReturnCreateSchema()
sale_schema = SaleSchema()
sale_return_schema = SaleReturnSchema()
sale_list_schema = SaleListSchema(many=True)


@sales_bp.route("/", methods=["POST"])
@require_permission("ventas:crear")
def create_sale():
    """Create a new sale with items and payments."""
    data = sale_create_schema.load(request.get_json(silent=True) or {})

    user_id = int(get_jwt_identity())

    try:
        sale = SaleService.create_sale(
            user_id=user_id,
            session_id=data["session_id"],
            items=data["items"],
            payments=data["payments"],
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(sale_schema.dump(sale)), 201


@sales_bp.route("/<int:sale_id>/cancel", methods=["POST"])
@require_permission("ventas:cancelar")
def cancel_sale(sale_id):
    """Cancel an existing sale and return inventory."""
    data = sale_cancel_schema.load(request.get_json(silent=True) or {})

    user_id = int(get_jwt_identity())

    try:
        sale = SaleService.cancel_sale(
            sale_id=sale_id,
            user_id=user_id,
            reason=data["reason"],
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(sale_schema.dump(sale)), 200


@sales_bp.route("/<int:sale_id>/return", methods=["POST"])
@require_permission("ventas:cancelar")
def return_sale(sale_id):
    """Process a return (partial or full) for a sale."""
    data = sale_return_create_schema.load(request.get_json(silent=True) or {})

    user_id = int(get_jwt_identity())

    try:
        sale_return = SaleService.return_sale(
            sale_id=sale_id,
            user_id=user_id,
            reason=data["reason"],
            items=data["items"],
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(sale_return_schema.dump(sale_return)), 200


@sales_bp.route("/", methods=["GET"])
@require_permission("ventas:ver")
def list_sales():
    """List sales with pagination."""
    query = Sale.query.order_by(Sale.created_at.desc())
    return jsonify(paginate(query, sale_list_schema)), 200


@sales_bp.route("/<int:sale_id>", methods=["GET"])
@require_permission("ventas:ver")
def get_sale(sale_id):
    """Get sale detail including items and payments."""
    sale = SaleService.get_sale(sale_id)
    if not sale:
        return jsonify({"error": "Venta no encontrada"}), 404

    return jsonify(sale_schema.dump(sale)), 200
