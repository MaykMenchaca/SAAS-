from functools import wraps
from flask_jwt_extended import current_user, get_jwt, verify_jwt_in_request
from flask import jsonify


def require_permission(permission):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("must_change_password"):
                return jsonify({"error": "Debe cambiar su contraseña", "code": "password_change_required"}), 403
            if not current_user or not current_user.is_active:
                return jsonify({"error": "Usuario inactivo o no encontrado", "code": "user_inactive"}), 401
            if current_user.must_change_password:
                return jsonify({"error": "Debe cambiar su contraseña", "code": "password_change_required"}), 403
            if permission not in current_user.permissions:
                return jsonify({"error": "Permiso insuficiente"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_role(role):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("must_change_password"):
                return jsonify({"error": "Debe cambiar su contraseña", "code": "password_change_required"}), 403
            if not current_user or not current_user.is_active:
                return jsonify({"error": "Usuario inactivo o no encontrado", "code": "user_inactive"}), 401
            if current_user.must_change_password:
                return jsonify({"error": "Debe cambiar su contraseña", "code": "password_change_required"}), 403
            if current_user.role_name != role:
                return jsonify({"error": "Rol insuficiente"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def audit_action(action, entity_type=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            response = fn(*args, **kwargs)
            
            # Determinar código de respuesta
            status_code = 200
            if isinstance(response, tuple):
                if len(response) >= 2:
                    status_code = response[1]
            
            # Solo registrar acciones exitosas (HTTP 2xx)
            if 200 <= status_code < 300:
                try:
                    entity_id = None
                    # Intentar extraer el ID de la entidad desde los parámetros de la ruta
                    for key, val in kwargs.items():
                        if key.endswith('_id') and isinstance(val, int):
                            entity_id = val
                            break
                    
                    from flask import request
                    details = None
                    if request.is_json:
                        try:
                            body = request.get_json()
                            if isinstance(body, dict):
                                # Ofuscar datos sensibles
                                details = {k: v for k, v in body.items() if k not in ("password", "current_password", "new_password", "token")}
                        except Exception:
                            pass

                    # Importar log_action para evitar importaciones circulares
                    from app.services.audit_service import log_action
                    log_action(
                        action=action,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        details=details
                    )
                except Exception as e:
                    # No fallar la petición si falla la auditoría, solo reportar
                    from flask import current_app
                    current_app.logger.error(f"[AUDIT ERROR] Error registrando accion {action}: {e}")
                    
            return response
        return wrapper
    return decorator


def with_rollback(fn):
    """Wraps a service method to guarantee db.session.rollback() on any uncaught exception (H-34)."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            from app.extensions import db
            db.session.rollback()
            raise
    return wrapper


