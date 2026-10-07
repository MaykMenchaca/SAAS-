import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://pos_user:pos_pass@localhost:5432/pos_db",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    }
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ACCESS_TOKEN_EXPIRES = 28800  # 8 horas
    BACKUP_DIR = os.getenv("BACKUP_DIR")
    USB_BACKUP_DIR = os.getenv("USB_BACKUP_DIR")
    SERVE_FRONTEND = os.getenv("SERVE_FRONTEND", "false").lower() == "true"
    FRONTEND_DIST = os.getenv("FRONTEND_DIST")
    JWT_REFRESH_TOKEN_EXPIRES = 604800  # 7 días


class TestConfig(Config):
    TESTING = True
    SECRET_KEY = "test-secret-key-at-least-32-chars-long-strictly-for-testing-123456"
    JWT_SECRET_KEY = "test-jwt-secret-key-at-least-32-chars-long-strictly-for-testing-654321"
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL",
        (
            Config.SQLALCHEMY_DATABASE_URI.rsplit("/", 1)[0] + "/pos_test_db"
            if Config.SQLALCHEMY_DATABASE_URI
            else "postgresql://pos_user@localhost:5432/pos_test_db"
        ),
    )


def validate_secrets(app):
    """Validate that SECRET_KEY and JWT_SECRET_KEY are present, distinct, and strong."""
    secret_key = app.config.get("SECRET_KEY")
    jwt_secret = app.config.get("JWT_SECRET_KEY")

    if not secret_key:
        raise RuntimeError("SECRET_KEY no está configurado")
    if not jwt_secret:
        raise RuntimeError("JWT_SECRET_KEY no está configurado")

    if len(str(secret_key)) < 32:
        raise RuntimeError("SECRET_KEY debe tener al menos 32 caracteres")
    if len(str(jwt_secret)) < 32:
        raise RuntimeError("JWT_SECRET_KEY debe tener al menos 32 caracteres")

    if secret_key == jwt_secret:
        raise RuntimeError("SECRET_KEY y JWT_SECRET_KEY deben ser diferentes")

    if "cambiar" in str(secret_key).lower():
        raise RuntimeError("SECRET_KEY contiene valores por defecto inseguros ('cambiar')")
    if "cambiar" in str(jwt_secret).lower():
        raise RuntimeError("JWT_SECRET_KEY contiene valores por defecto inseguros ('cambiar')")
