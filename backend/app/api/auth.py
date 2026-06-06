from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services.auth_service import AuthService

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "Username y password son requeridos"}), 400

    result = AuthService.authenticate(username, password)
    if result:
        return jsonify(result), 200
    return jsonify({"error": "Credenciales invalidas"}), 401


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = AuthService.current_user_payload(get_jwt_identity())
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify(user), 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    new_token = AuthService.refresh_access_token(get_jwt_identity())
    if not new_token:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify({"access_token": new_token}), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    return jsonify({"message": "Sesion cerrada"}), 200
