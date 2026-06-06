from flask import Flask
from app.config import Config
from app.extensions import db, jwt, migrate, cors


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app)

    from app.api import register_blueprints
    register_blueprints(app)

    from app.utils.errors import register_error_handlers
    register_error_handlers(app)

    return app
