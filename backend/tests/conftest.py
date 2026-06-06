import pytest
from app import create_app
from app.config import TestConfig
from app.extensions import db as _db
from app.models import User, Role, Permission  # noqa: F401 — register models


@pytest.fixture(scope="session")
def flask_app():
    application = create_app(TestConfig)
    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


@pytest.fixture(autouse=True)
def db_session(flask_app):
    with flask_app.app_context():
        _db.session.begin_nested()
        yield _db
        _db.session.rollback()


@pytest.fixture
def app(flask_app):
    return flask_app


@pytest.fixture
def client(flask_app):
    return flask_app.test_client()


@pytest.fixture
def db(db_session):
    return db_session
