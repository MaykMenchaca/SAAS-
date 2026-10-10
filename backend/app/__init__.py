from pathlib import Path

from flask import Flask, abort, send_from_directory
from app.config import Config, validate_secrets, validate_timezone
from app.extensions import db, jwt, migrate, cors


def create_app(config_class=Config):
    application = Flask(__name__)
    application.config.from_object(config_class)

    _setup_logging(application)
    validate_secrets(application)
    validate_timezone(application)

    db.init_app(application)
    jwt.init_app(application)
    _setup_jwt(jwt)
    migrate.init_app(application, db)
    cors.init_app(application)


    with application.app_context():
        from app import models  # noqa: F401 — register models for Alembic

    from app.api import register_blueprints
    register_blueprints(application)

    from app.utils.errors import register_error_handlers
    register_error_handlers(application)

    from app.seed import seed_command
    application.cli.add_command(seed_command)

    from app.services.backup_service import backup_command
    application.cli.add_command(backup_command)

    _register_frontend_routes(application)

    return application


def _setup_logging(application):
    """Configura RotatingFileHandler para pos.log en logs/."""
    import logging
    from logging.handlers import RotatingFileHandler

    log_dir = Path(application.root_path).parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "pos.log"

    has_rotating = any(isinstance(h, RotatingFileHandler) for h in application.logger.handlers)
    if not has_rotating:
        handler = RotatingFileHandler(
            str(log_file),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        formatter = logging.Formatter(
            "[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
        )
        handler.setFormatter(formatter)
        handler.setLevel(logging.INFO)
        application.logger.addHandler(handler)
        application.logger.setLevel(logging.INFO)


def _setup_jwt(jwt_mgr):
    """Configura loaders de revocación y usuario para JWT."""
    from flask import jsonify

    @jwt_mgr.token_in_blocklist_loader
    def token_in_blocklist_loader(jwt_header, jwt_payload: dict) -> bool:
        from app.models.user import TokenBlocklist, User
        jti = jwt_payload.get("jti")
        if not jti:
            return True

        # 1. Comprobar jti en lista de tokens revocados (logout)
        if TokenBlocklist.query.filter_by(jti=jti).first():
            return True

        # 2. Comprobar vigencia de token_version y estatus activo del usuario
        user_id = jwt_payload.get("sub")
        if user_id:
            try:
                user = db.session.get(User, int(user_id))
                if not user or not user.is_active:
                    return True
                token_version = jwt_payload.get("token_version")
                if token_version is not None and user.token_version != token_version:
                    return True
            except (ValueError, TypeError):
                return True

        return False

    @jwt_mgr.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "El token ha sido revocado", "code": "token_revoked"}), 401

    @jwt_mgr.user_lookup_loader
    def user_lookup_callback(_jwt_header, jwt_data):
        from app.models.user import User
        identity = jwt_data.get("sub")
        if not identity:
            return None
        try:
            user = db.session.get(User, int(identity))
            if not user or not user.is_active:
                return None
            return user
        except (ValueError, TypeError):
            return None

    @jwt_mgr.user_lookup_error_loader
    def user_lookup_error_callback(_jwt_header, _jwt_data):
        return jsonify({"error": "Usuario inactivo o no encontrado", "code": "user_inactive"}), 401


def _register_frontend_routes(application):
    """Serve the built React SPA from Flask when production mode requests it."""
    if not application.config.get("SERVE_FRONTEND"):
        return

    configured_dist = application.config.get("FRONTEND_DIST")
    frontend_dist = (
        Path(configured_dist)
        if configured_dist
        else Path(application.root_path).parents[1] / "frontend" / "dist"
    )

    if not frontend_dist.exists():
        return

    @application.route("/", defaults={"path": ""})
    @application.route("/<path:path>")
    def serve_frontend(path):
        if path.startswith("api/"):
            abort(404)

        requested = frontend_dist / path
        if path and requested.is_file():
            return send_from_directory(frontend_dist, path)

        return send_from_directory(frontend_dist, "index.html")
