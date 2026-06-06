from flask import Blueprint, jsonify, request

from app.schemas.product import CategorySchema, CategoryUpdateSchema
from app.services.product_service import CategoryService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate

categories_bp = Blueprint("categories", __name__)

category_schema = CategorySchema()
categories_schema = CategorySchema(many=True)
category_update_schema = CategoryUpdateSchema()


@categories_bp.route("/", methods=["GET"])
@require_permission("productos:ver")
def list_categories():
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    query = CategoryService.list_categories(include_inactive=include_inactive)
    return jsonify(paginate(query, categories_schema)), 200


@categories_bp.route("/<int:category_id>", methods=["GET"])
@require_permission("productos:ver")
def get_category(category_id):
    category = CategoryService.get_category(category_id)
    if not category:
        return jsonify({"error": "Categoria no encontrada"}), 404
    return jsonify(category_schema.dump(category)), 200


@categories_bp.route("/", methods=["POST"])
@require_permission("productos:crear")
def create_category():
    data = category_schema.load(request.get_json(silent=True) or {})
    category = CategoryService.create_category(data)
    return jsonify(category_schema.dump(category)), 201


@categories_bp.route("/<int:category_id>", methods=["PATCH"])
@require_permission("productos:editar")
def update_category(category_id):
    category = CategoryService.get_category(category_id)
    if not category:
        return jsonify({"error": "Categoria no encontrada"}), 404

    data = category_update_schema.load(request.get_json(silent=True) or {})
    category = CategoryService.update_category(category, data)
    return jsonify(category_schema.dump(category)), 200


@categories_bp.route("/<int:category_id>", methods=["DELETE"])
@require_permission("productos:desactivar")
def deactivate_category(category_id):
    category = CategoryService.get_category(category_id)
    if not category:
        return jsonify({"error": "Categoria no encontrada"}), 404

    category = CategoryService.deactivate_category(category)
    return jsonify(category_schema.dump(category)), 200
