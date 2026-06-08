import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://pos_user:pos_pass@localhost:5432/pos_db",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-dev-secret")
    JWT_ACCESS_TOKEN_EXPIRES = 28800  # 8 horas
    BACKUP_DIR = os.getenv("BACKUP_DIR", "backups")
    USB_BACKUP_DIR = os.getenv("USB_BACKUP_DIR")
    JWT_REFRESH_TOKEN_EXPIRES = 604800  # 7 días


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = (
        "postgresql://pos_user:pos_pass@localhost:5432/pos_test_db"
    )
