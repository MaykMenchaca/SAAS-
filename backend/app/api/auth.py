from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.services.audit_service import log_action
from app.services.auth_service import AuthService

auth_bp = Blueprint("auth", __name__)


from app.services.rate_limiter import login_limiter


@auth_bp.route("/login", methods=["POST"])
def login():
    ip = request.remote_addr or "127.0.0.1"
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password")

    if login_limiter.is_ip_limited(ip):
        return jsonify({"error": "Demasiados intentos de acceso. Intente de nuevo en un minuto."}), 429

    if login_limiter.is_user_locked(username):
        return jsonify({"error": "Usuario bloqueado temporalmente por demasiados intentos fallidos. Intente de nuevo en 5 minutos."}), 429

    login_limiter.record_ip_attempt(ip)

    if not username or not password:
        return jsonify({"error": "Username y password son requeridos"}), 400

    result = AuthService.authenticate(username, password)
    if result:
        login_limiter.record_login_success(username)
        log_action(
            action="login",
            entity_type="user",
            entity_id=result["user"]["id"],
            user_id=result["user"]["id"],
            username=result["user"]["username"],
            commit=True,
        )
        return jsonify(result), 200

    login_limiter.record_login_failure(username)
    log_action(
        action="login_failed",
        details={"username": username},
        commit=True,
    )
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
@jwt_required(verify_type=False)
def logout():
    from datetime import datetime, timezone
    from flask_jwt_extended import get_jwt
    from app.models.user import TokenBlocklist

    jwt_payload = get_jwt()
    jti = jwt_payload.get("jti")
    token_type = jwt_payload.get("type", "access")
    exp = jwt_payload.get("exp")
    expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else None
    user_id = int(get_jwt_identity()) if get_jwt_identity() else None

    if jti and not TokenBlocklist.query.filter_by(jti=jti).first():
        db.session.add(TokenBlocklist(
            jti=jti,
            token_type=token_type,
            user_id=user_id,
            expires_at=expires_at,
        ))

    body = request.get_json(silent=True) or {}
    refresh_token_raw = body.get("refresh_token")
    if refresh_token_raw:
        try:
            from flask_jwt_extended import decode_token
            decoded = decode_token(refresh_token_raw)
            ref_jti = decoded.get("jti")
            ref_exp = decoded.get("exp")
            ref_expires_at = datetime.fromtimestamp(ref_exp, tz=timezone.utc) if ref_exp else None
            if ref_jti and not TokenBlocklist.query.filter_by(jti=ref_jti).first():
                db.session.add(TokenBlocklist(
                    jti=ref_jti,
                    token_type="refresh",
                    user_id=user_id,
                    expires_at=ref_expires_at,
                ))
        except Exception:
            pass

    log_action(action="logout", entity_type="user", user_id=user_id, commit=True)
    return jsonify({"message": "Sesion cerrada exitosamente"}), 200


@auth_bp.route("/change-password", methods=["POST"])
@jwt_required()
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    if not current_password or not new_password:
        return jsonify({"error": "current_password y new_password son requeridos"}), 400

    from app.models.user import User
    from app.extensions import db
    from flask_jwt_extended import create_access_token

    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user or not user.check_password(current_password):
        return jsonify({"error": "Contraseña actual incorrecta"}), 400

    if len(new_password) < 8:
        return jsonify({"error": "La nueva contraseña debe tener al menos 8 caracteres"}), 400

    user.set_password(new_password)
    user.must_change_password = False

    log_action(
        action="change_password",
        entity_type="user",
        entity_id=user.id,
        user_id=user.id,
        username=user.username,
    )
    db.session.commit()

    claims = AuthService._token_claims(user)
    new_token = create_access_token(identity=str(user.id), additional_claims=claims)
    return jsonify({
        "message": "Contraseña actualizada exitosamente",
        "access_token": new_token,
        "must_change_password": False,
    }), 200

