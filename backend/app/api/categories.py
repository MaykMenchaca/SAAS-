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

    # Cambiar is_active exige `productos:desactivar`, igual que el DELETE (RF-08)
    if "is_active" in data and data["is_active"] != category.is_active:
        from flask_jwt_extended import current_user

        if not current_user or not (current_user.role_name == "admin" or "productos:desactivar" in current_user.permissions):
            return jsonify({"error": "Permiso insuficiente para desactivar o reactivar categorías",
                            "code": "forbidden"}), 403
        if not data["is_active"]:
            data.pop("is_active")
            try:
                category = CategoryService.deactivate_category(category)
            except ValueError as e:  # tiene productos activos (RF-20)
                return jsonify({"error": str(e)}), 400
    else:
        data.pop("is_active", None)

    if data:
        category = CategoryService.update_category(category, data)
    return jsonify(category_schema.dump(category)), 200


@categories_bp.route("/<int:category_id>", methods=["DELETE"])
@require_permission("productos:desactivar")
def deactivate_category(category_id):
    category = CategoryService.get_category(category_id)
    if not category:
        return jsonify({"error": "Categoria no encontrada"}), 404

    try:
        category = CategoryService.deactivate_category(category)
    except ValueError as e:  # tiene productos activos (RF-20)
        return jsonify({"error": str(e)}), 400
    return jsonify(category_schema.dump(category)), 200
