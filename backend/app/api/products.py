from flask import Blueprint, jsonify, request

from app.schemas.product import (
    ProductCreateSchema,
    ProductSchema,
    ProductUpdateSchema,
    UnitOfMeasureSchema,
)
from app.services.product_service import ProductService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate

products_bp = Blueprint("products", __name__)

product_schema = ProductSchema()
products_schema = ProductSchema(many=True)
product_create_schema = ProductCreateSchema()
product_update_schema = ProductUpdateSchema()
units_schema = UnitOfMeasureSchema(many=True)
unit_schema = UnitOfMeasureSchema()


@products_bp.route("/", methods=["GET"])
@require_permission("productos:ver")
def list_products():
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    category_id = request.args.get("category_id", type=int)
    search = request.args.get("search") or request.args.get("q")
    query = ProductService.list_products(
        include_inactive=include_inactive,
        search=search,
        category_id=category_id,
    )
    return jsonify(paginate(query, products_schema)), 200


@products_bp.route("/units", methods=["GET"])
@require_permission("productos:ver")
def list_units():
    return jsonify(units_schema.dump(ProductService.list_units())), 200


@products_bp.route("/units", methods=["POST"])
@require_permission("productos:crear")
def create_unit():
    data = unit_schema.load(request.get_json(silent=True) or {})
    unit = ProductService.create_unit(data)
    return jsonify(unit_schema.dump(unit)), 201


@products_bp.route("/units/<int:unit_id>", methods=["PATCH"])
@require_permission("productos:editar")
def update_unit(unit_id):
    unit = ProductService.get_unit(unit_id)
    if not unit:
        return jsonify({"error": "Unidad de medida no encontrada"}), 404
    data = unit_schema.load(request.get_json(silent=True) or {}, partial=True)
    unit = ProductService.update_unit(unit, data)
    return jsonify(unit_schema.dump(unit)), 200


@products_bp.route("/units/<int:unit_id>", methods=["DELETE"])
@require_permission("productos:desactivar")
def delete_unit(unit_id):
    unit = ProductService.get_unit(unit_id)
    if not unit:
        return jsonify({"error": "Unidad de medida no encontrada"}), 404
    ProductService.delete_unit(unit)
    return jsonify({"success": True}), 200


@products_bp.route("/<int:product_id>", methods=["GET"])
@require_permission("productos:ver")
def get_product(product_id):
    product = ProductService.get_product(product_id)
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404
    return jsonify(product_schema.dump(product)), 200


@products_bp.route("/", methods=["POST"])
@require_permission("productos:crear")
def create_product():
    data = product_create_schema.load(request.get_json(silent=True) or {})
    product = ProductService.create_product(data)
    return jsonify(product_schema.dump(product)), 201


@products_bp.route("/<int:product_id>", methods=["PATCH"])
@require_permission("productos:editar")
def update_product(product_id):
    from flask_jwt_extended import current_user

    product = ProductService.get_product(product_id)
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404

    data = product_update_schema.load(request.get_json(silent=True) or {})

    price_fields = ("sale_price", "purchase_price")
    changing_price = any(
        field in data and getattr(product, field) != data[field]
        for field in price_fields
    )
    if changing_price:
        if not current_user or "productos:editar_precio" not in current_user.permissions:
            return jsonify({
                "error": "Permiso insuficiente para modificar precios o costos",
                "code": "forbidden",
            }), 403

    product = ProductService.update_product(product, data)
    return jsonify(product_schema.dump(product)), 200


@products_bp.route("/<int:product_id>", methods=["DELETE"])
@require_permission("productos:desactivar")
def deactivate_product(product_id):
    product = ProductService.get_product(product_id)
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404

    product = ProductService.deactivate_product(product)
    return jsonify(product_schema.dump(product)), 200
