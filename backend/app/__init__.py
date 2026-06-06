from flask import Flask
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

    return application
