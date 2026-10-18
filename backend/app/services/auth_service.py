from datetime import datetime, timezone
from app.extensions import db
from app.models.user import User
from flask_jwt_extended import create_access_token, create_refresh_token
from sqlalchemy import func


class AuthService:
    @staticmethod
    def _user_payload(user):
        return {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role_name,
            "permissions": user.permissions,
            "must_change_password": bool(user.must_change_password),
        }

    @staticmethod
    def _token_claims(user):
        payload = AuthService._user_payload(user)
        return {
            "username": payload["username"],
            "full_name": payload["full_name"],
            "role": payload["role"],
            "permissions": payload["permissions"],
            "must_change_password": bool(user.must_change_password),
            "token_version": getattr(user, "token_version", 1) or 1,
        }

    @staticmethod
    def find_login_user(username):
        """Usuario activo para el login, sin distinguir mayúsculas (RF-28, RF-42).

        Primero la coincidencia exacta (por si quedan duplicados heredados que solo difieren en
        mayúsculas); si no, la única coincidencia sin mayúsculas. Si hay varias, es ambiguo: None.
        """
        if not username:
            return None
        user = User.query.filter_by(username=username, is_active=True).first()
        if user:
            return user
        matches = (
            User.query.filter(func.lower(User.username) == username.lower(), User.is_active.is_(True))
            .limit(2)
            .all()
        )
        return matches[0] if len(matches) == 1 else None

    @staticmethod
    def issue_tokens(user):
        """Par de tokens con los claims vigentes del usuario (login y cambio de contraseña, RF-24)."""
        claims = AuthService._token_claims(user)
        return {
            "access_token": create_access_token(identity=str(user.id), additional_claims=claims),
            "refresh_token": create_refresh_token(identity=str(user.id), additional_claims=claims),
        }

    @staticmethod
    def authenticate_user(user, password):
        if user and user.check_password(password):
            user.last_login_at = datetime.now(timezone.utc)
            db.session.commit()
            return {
                **AuthService.issue_tokens(user),
                "user": AuthService._user_payload(user),
                "must_change_password": bool(user.must_change_password),
            }
        return None

    @staticmethod
    def authenticate(username, password):
        return AuthService.authenticate_user(AuthService.find_login_user(username), password)

    @staticmethod
    def current_user_payload(user_id):
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return None

        user = User.query.filter_by(id=user_id, is_active=True).first()
        if not user:
            return None
        return AuthService._user_payload(user)

    @staticmethod
    def refresh_access_token(user_id):
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return None

        user = User.query.filter_by(id=user_id, is_active=True).first()
        if not user:
            return None
        return create_access_token(
            identity=str(user.id),
            additional_claims=AuthService._token_claims(user),
        )
