from marshmallow import ValidationError
from sqlalchemy import or_

from app.extensions import db
from app.models.user import Role, User


class UserService:
    @staticmethod
    def list_users(include_inactive=False, search=None):
        query = User.query

        if not include_inactive:
            query = query.filter_by(is_active=True)

        if search:
            pattern = f"%{search}%"
            query = query.filter(
                or_(
                    User.username.ilike(pattern),
                    User.email.ilike(pattern),
                    User.full_name.ilike(pattern),
                )
            )

        return query.order_by(User.id.asc())

    @staticmethod
    def list_roles():
        return Role.query.filter_by(is_active=True).order_by(Role.name.asc()).all()

    @staticmethod
    def get_user(user_id, include_inactive=True):
        query = User.query.filter_by(id=user_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.first()

    @staticmethod
    def create_user(data):
        UserService._validate_role(data["role_id"])
        UserService._validate_unique_user(
            username=data["username"],
            email=data["email"],
        )

        user = User(
            username=data["username"],
            email=data["email"],
            full_name=data["full_name"],
            role_id=data["role_id"],
        )
        user.set_password(data["password"])

        db.session.add(user)
        db.session.flush()

        from app.services.audit_service import log_action
        log_action(
            action="crear",
            entity_type="user",
            entity_id=user.id,
            details={"username": user.username, "role_id": user.role_id},
            new_value={
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "role_id": user.role_id,
            },
        )

        db.session.commit()
        return user

    @staticmethod
    def update_user(user, data):
        if "role_id" in data:
            UserService._validate_role(data["role_id"])

        UserService._validate_unique_user(
            username=data.get("username"),
            email=data.get("email"),
            exclude_user_id=user.id,
        )

        previous_value = {
            field: getattr(user, field)
            for field in ("username", "email", "full_name", "role_id", "is_active")
            if field in data
        }

        for field in ("username", "email", "full_name", "role_id", "is_active"):
            if field in data:
                setattr(user, field, data[field])

        new_value = {
            field: getattr(user, field)
            for field in ("username", "email", "full_name", "role_id", "is_active")
            if field in data
        }

        if "password" in data:
            user.set_password(data["password"])
            new_value["password"] = "[CHANGED]"

        role_changed = "role_id" in data and data["role_id"] != previous_value.get("role_id")
        deactivated = "is_active" in data and not data["is_active"] and previous_value.get("is_active")
        if role_changed or deactivated:
            user.token_version = (user.token_version or 1) + 1

        from app.services.audit_service import log_action
        log_action(
            action="editar",
            entity_type="user",
            entity_id=user.id,
            details={"username": user.username},
            previous_value=previous_value,
            new_value=new_value,
        )

        db.session.commit()
        return user

    @staticmethod
    def deactivate_user(user):
        prev_active = user.is_active
        user.is_active = False
        user.token_version = (user.token_version or 1) + 1

        from app.services.audit_service import log_action
        log_action(
            action="desactivar",
            entity_type="user",
            entity_id=user.id,
            details={"username": user.username},
            previous_value={"is_active": prev_active},
            new_value={"is_active": False},
        )

        db.session.commit()
        return user

    @staticmethod
    def _validate_role(role_id):
        role = Role.query.filter_by(id=role_id, is_active=True).first()
        if not role:
            raise ValidationError({"role_id": ["Rol no encontrado"]})

    @staticmethod
    def _validate_unique_user(username=None, email=None, exclude_user_id=None):
        errors = {}

        if username:
            query = User.query.filter_by(username=username)
            if exclude_user_id is not None:
                query = query.filter(User.id != exclude_user_id)
            if query.first():
                errors["username"] = ["Username ya existe"]

        if email:
            query = User.query.filter_by(email=email)
            if exclude_user_id is not None:
                query = query.filter(User.id != exclude_user_id)
            if query.first():
                errors["email"] = ["Email ya existe"]

        if errors:
            raise ValidationError(errors)
