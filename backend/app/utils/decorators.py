from functools import wraps
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from flask import jsonify


def require_permission(permission):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            identity = get_jwt_identity()
            if permission not in identity.get("permissions", []):
                return jsonify({"error": "Permiso insuficiente"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_role(role):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            identity = get_jwt_identity()
            if identity.get("role") != role:
                return jsonify({"error": "Rol insuficiente"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
