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
    "inventario:ver": "Ver stock y movimientos",
    "inventario:ajustar": "Ajustar stock manualmente",
    "ventas:crear": "Crear ventas",
    "ventas:ver": "Ver ventas",
    "ventas:cancelar": "Cancelar ventas",
    "ventas:descuento": "Aplicar descuentos mayores al tope permitido",
    "caja:abrir": "Abrir sesion de caja",
    "caja:cerrar": "Cerrar sesion de caja",
    "caja:ver": "Ver sesiones de caja",
    "caja:supervisar": "Supervisar, vender y cerrar cajas de otros usuarios",
    "compras:ver": "Ver proveedores y ordenes de compra",
    "compras:crear": "Crear ordenes de compra",
    "compras:editar": "Editar proveedores y ordenes",
    "compras:recibir": "Recibir mercancia",
    "reportes:ver": "Ver reportes y dashboard",
}


@pytest.fixture(scope="session")
def flask_app():
    application = create_app(TestConfig)
    with application.app_context():
        _db.drop_all()
        _db.create_all()
        # Create sequences and extensions not managed by SQLAlchemy's create_all
        _db.session.execute(
            _db.text("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        )
        _db.session.execute(
            _db.text("CREATE SEQUENCE IF NOT EXISTS sale_folio_seq START 1")
        )
        _db.session.execute(
            _db.text("CREATE SEQUENCE IF NOT EXISTS purchase_order_folio_seq START 1")
        )
        _db.session.commit()
    yield application
    with application.app_context():
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(autouse=True)
def db_session(flask_app):
    """Truncate all tables between tests instead of drop/create.

    This avoids FK ordering issues that cause intermittent failures
    with drop_all() when the schema has many cross-table foreign keys.
    """
    with flask_app.app_context():
        yield _db
        _db.session.remove()
        # TRUNCATE CASCADE handles FK ordering automatically
        tables = ",".join(
            f'"{t.name}"' for t in reversed(_db.metadata.sorted_tables)
        )
        if tables:
            _db.session.execute(_db.text(f"TRUNCATE TABLE {tables} CASCADE"))
            _db.session.commit()


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    from app.services.rate_limiter import login_limiter
    login_limiter.reset()
    yield
    login_limiter.reset()


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
    gerente_role.permissions.append(seed_permissions["ventas:descuento"])
    gerente_role.permissions.append(seed_permissions["caja:supervisar"])
    gerente_role.permissions.append(seed_permissions["caja:cerrar"])
    gerente_role.permissions.append(seed_permissions["ventas:crear"])
    # Cajero gets POS-related permissions
    for code in ("ventas:crear", "ventas:ver", "caja:abrir", "caja:cerrar", "caja:ver",
                 "productos:ver", "inventario:ver"):
        cajero_role.permissions.append(seed_permissions[code])
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


@pytest.fixture
def seed_cash_register(db):
    from app.models.sale import CashRegister
    register = CashRegister(name="Caja 1")
    db.session.add(register)
    db.session.flush()
    return register


@pytest.fixture
def seed_open_session(db, seed_admin, seed_cash_register):
    from app.models.sale import CashRegisterSession
    from decimal import Decimal
    session = CashRegisterSession(
        cash_register_id=seed_cash_register.id,
        user_id=seed_admin.id,
        opening_amount=Decimal("1000.00"),
        status="abierta",
    )
    db.session.add(session)
    db.session.flush()
    return session


@pytest.fixture
def seed_product_for_sale(db):
    from app.models.product import Product, UnitOfMeasure
    from app.models.inventory import Stock
    from decimal import Decimal

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()

    product = Product(
        sku="POS-001",
        name="Martillo",
        unit_id=unit.id,
        sale_price=Decimal("100.00"),
        avg_cost=Decimal("60.00"),
        tax_rate=Decimal("16.00"),
    )
    db.session.add(product)
    db.session.flush()

    stock = Stock(product_id=product.id, quantity=Decimal("100.000"))
    db.session.add(stock)
    db.session.flush()
    return product
