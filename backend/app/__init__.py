from pathlib import Path

from flask import Flask, abort, send_from_directory
from app.config import Config
from app.extensions import db, jwt, migrate, cors


def create_app(config_class=Config):
    application = Flask(__name__)
    application.config.from_object(config_class)

    db.init_app(application)
    jwt.init_app(application)
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

    _register_frontend_routes(application)

    return application


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
