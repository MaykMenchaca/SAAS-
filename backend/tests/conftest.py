import pytest
from app import create_app
from app.config import TestConfig
from app.extensions import db as _db
from app.models import User, Role, Permission  # noqa: F401


PERMISSION_CODES = {
    "usuarios:ver": "Ver lista de usuarios",
    "usuarios:crear": "Crear usuarios",
    "usuarios:editar": "Editar usuarios",
    "usuarios:desactivar": "Desactivar usuarios",
    "productos:ver": "Ver catalogo de productos",
    "productos:crear": "Crear productos",
    "productos:editar": "Editar productos",
    "productos:editar_precio": "Modificar precios de venta",
    "productos:desactivar": "Desactivar productos",
}


@pytest.fixture(scope="session")
def flask_app():
    application = create_app(TestConfig)
    yield application
    with application.app_context():
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(autouse=True)
def db_session(flask_app):
    with flask_app.app_context():
        _db.session.remove()
        _db.drop_all()
        _db.create_all()
        yield _db
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def app(flask_app):
    return flask_app


@pytest.fixture
def client(flask_app):
    return flask_app.test_client()


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def seed_permissions(db):
    permissions = {}
    for code, description in PERMISSION_CODES.items():
        module = code.split(":", maxsplit=1)[0]
        permission = Permission(code=code, module=module, description=description)
        db.session.add(permission)
        permissions[code] = permission
    db.session.flush()
    return permissions


@pytest.fixture
def seed_roles(db, seed_permissions):
    admin_role = Role(name="admin", description="Administrador")
    gerente_role = Role(name="gerente", description="Gerente")
    cajero_role = Role(name="cajero", description="Cajero")
    admin_role.permissions.extend(seed_permissions.values())
    gerente_role.permissions.append(seed_permissions["usuarios:ver"])
    db.session.add_all([admin_role, gerente_role, cajero_role])
    db.session.flush()
    return {"admin": admin_role, "gerente": gerente_role, "cajero": cajero_role}


@pytest.fixture
def seed_admin(db, seed_roles):
    user = User(
        username="admin",
        email="admin@test.com",
        full_name="Admin User",
        role_id=seed_roles["admin"].id,
    )
    user.set_password("admin123")
    db.session.add(user)
    db.session.flush()
    return user


@pytest.fixture
def seed_cajero(db, seed_roles):
    user = User(
        username="cajero1",
        email="cajero1@test.com",
        full_name="Cajero Test",
        role_id=seed_roles["cajero"].id,
    )
    user.set_password("cajero123")
    db.session.add(user)
    db.session.flush()
    return user


@pytest.fixture
def admin_token(client, seed_admin):
    response = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    return response.get_json()["access_token"]


@pytest.fixture
def admin_refresh_token(client, seed_admin):
    response = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    return response.get_json()["refresh_token"]


@pytest.fixture
def regular_user_token(client, seed_cajero):
    response = client.post("/api/auth/login", json={
        "username": "cajero1",
        "password": "cajero123",
    })
    return response.get_json()["access_token"]
