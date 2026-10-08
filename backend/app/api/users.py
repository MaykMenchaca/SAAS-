from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.schemas.user import RoleSchema, UserCreateSchema, UserSchema, UserUpdateSchema
from app.services.user_service import UserService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate

users_bp = Blueprint("users", __name__)

user_schema = UserSchema()
users_schema = UserSchema(many=True)
user_create_schema = UserCreateSchema()
user_update_schema = UserUpdateSchema()
roles_schema = RoleSchema(many=True)


@users_bp.route("/", methods=["GET"])
@require_permission("usuarios:ver")
def list_users():
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    search = request.args.get("search")
    query = UserService.list_users(
        include_inactive=include_inactive,
        search=search,
    )
    return jsonify(paginate(query, users_schema)), 200


@users_bp.route("/roles", methods=["GET"])
@require_permission("usuarios:ver")
def list_roles():
    return jsonify(roles_schema.dump(UserService.list_roles())), 200


@users_bp.route("/<int:user_id>", methods=["GET"])
@require_permission("usuarios:ver")
def get_user(user_id):
    user = UserService.get_user(user_id)
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify(user_schema.dump(user)), 200


@users_bp.route("/", methods=["POST"])
@require_permission("usuarios:crear")
def create_user():
    data = user_create_schema.load(request.get_json(silent=True) or {})
    user = UserService.create_user(data)
    return jsonify(user_schema.dump(user)), 201


@users_bp.route("/<int:user_id>", methods=["PATCH"])
@require_permission("usuarios:editar")
def update_user(user_id):
    user = UserService.get_user(user_id)
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    current_user_id = int(get_jwt_identity())
    data = user_update_schema.load(request.get_json(silent=True) or {})
    try:
        user = UserService.update_user(user, data, current_user_id=current_user_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(user_schema.dump(user)), 200


@users_bp.route("/<int:user_id>", methods=["DELETE"])
@require_permission("usuarios:desactivar")
def deactivate_user(user_id):
    user = UserService.get_user(user_id)
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    current_user_id = int(get_jwt_identity())
    try:
        user = UserService.deactivate_user(user, current_user_id=current_user_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return jsonify(user_schema.dump(user)), 200
