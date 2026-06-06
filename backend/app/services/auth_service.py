from datetime import datetime, timezone
from app.extensions import db
from app.models.user import User
from flask_jwt_extended import create_access_token, create_refresh_token


class AuthService:
    @staticmethod
    def _user_payload(user):
        return {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role_name,
            "permissions": user.permissions,
        }

    @staticmethod
    def _token_claims(user):
        payload = AuthService._user_payload(user)
        return {
            "username": payload["username"],
            "full_name": payload["full_name"],
            "role": payload["role"],
            "permissions": payload["permissions"],
        }

    @staticmethod
    def authenticate(username, password):
        user = User.query.filter_by(username=username, is_active=True).first()
        if user and user.check_password(password):
            user.last_login_at = datetime.now(timezone.utc)
            db.session.commit()

            claims = AuthService._token_claims(user)
            return {
                "access_token": create_access_token(
                    identity=str(user.id),
                    additional_claims=claims,
                ),
                "refresh_token": create_refresh_token(
                    identity=str(user.id),
                    additional_claims=claims,
                ),
                "user": AuthService._user_payload(user),
            }
        return None

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
