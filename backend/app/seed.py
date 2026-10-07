"""Seed script — initial data for a fresh POS installation.

Usage:
    flask seed          # Create all seed data
    flask seed --reset  # Drop and recreate all data (dev only)
"""
import click
from flask.cli import with_appcontext

from app.extensions import db
from app.models.product import UnitOfMeasure
from app.models.sale import CashRegister
from app.models.user import Permission, Role, User

# All system permissions
PERMISSIONS = {
    # Users
    "usuarios:ver": ("usuarios", "Ver lista de usuarios"),
    "usuarios:crear": ("usuarios", "Crear usuarios"),
    "usuarios:editar": ("usuarios", "Editar usuarios"),
    "usuarios:desactivar": ("usuarios", "Desactivar usuarios"),
    # Products
    "productos:ver": ("productos", "Ver catalogo de productos"),
    "productos:crear": ("productos", "Crear productos"),
    "productos:editar": ("productos", "Editar productos"),
    "productos:editar_precio": ("productos", "Modificar precios de venta"),
    "productos:desactivar": ("productos", "Desactivar productos"),
    # Inventory
    "inventario:ver": ("inventario", "Ver stock y movimientos"),
    "inventario:ajustar": ("inventario", "Ajustar stock manualmente"),
    # Sales
    "ventas:crear": ("ventas", "Crear ventas"),
    "ventas:ver": ("ventas", "Ver ventas"),
    "ventas:cancelar": ("ventas", "Cancelar ventas"),
    # Cash register
    "caja:abrir": ("caja", "Abrir sesion de caja"),
    "caja:cerrar": ("caja", "Cerrar sesion de caja"),
    "caja:ver": ("caja", "Ver sesiones de caja"),
    # Purchases
    "compras:ver": ("compras", "Ver proveedores y ordenes de compra"),
    "compras:crear": ("compras", "Crear ordenes de compra"),
    "compras:editar": ("compras", "Editar proveedores y ordenes"),
    "compras:recibir": ("compras", "Recibir mercancia"),
    # Reports
    "reportes:ver": ("reportes", "Ver reportes y dashboard"),
}

# Role → permission codes
ROLES = {
    "admin": {
        "description": "Administrador con acceso completo",
        "permissions": list(PERMISSIONS.keys()),
    },
    "gerente": {
        "description": "Gerente de sucursal",
        "permissions": [
            "usuarios:ver",
            "productos:ver", "productos:crear", "productos:editar", "productos:editar_precio",
            "inventario:ver", "inventario:ajustar",
            "ventas:ver", "ventas:cancelar",
            "caja:abrir", "caja:cerrar", "caja:ver",
            "compras:ver", "compras:crear", "compras:editar", "compras:recibir",
            "reportes:ver",
        ],
    },
    "cajero": {
        "description": "Cajero de punto de venta",
        "permissions": [
            "productos:ver",
            "inventario:ver",
            "ventas:crear", "ventas:ver",
            "caja:abrir", "caja:cerrar", "caja:ver",
        ],
    },
}

# Default units of measure
UNITS = [
    ("Pieza", "pz", False),
    ("Kilogramo", "kg", True),
    ("Litro", "lt", True),
    ("Metro", "m", True),
    ("Caja", "cja", False),
    ("Par", "par", False),
    ("Rollo", "rollo", False),
]


def seed_permissions():
    """Create all system permissions."""
    created = 0
    perm_map = {}
    for code, (module, description) in PERMISSIONS.items():
        existing = Permission.query.filter_by(code=code).first()
        if existing:
            perm_map[code] = existing
            continue
        perm = Permission(code=code, module=module, description=description)
        db.session.add(perm)
        perm_map[code] = perm
        created += 1

    db.session.flush()
    click.echo(f"  Permisos: {created} creados, {len(PERMISSIONS) - created} existentes")
    return perm_map


def seed_roles(perm_map):
    """Create roles and assign permissions."""
    created = 0
    for role_name, config in ROLES.items():
        existing = Role.query.filter_by(name=role_name).first()
        if existing:
            continue
        role = Role(name=role_name, description=config["description"])
        for code in config["permissions"]:
            if code in perm_map:
                role.permissions.append(perm_map[code])
        db.session.add(role)
        created += 1

    db.session.flush()
    click.echo(f"  Roles: {created} creados, {len(ROLES) - created} existentes")


def seed_admin_user():
    """Create the default admin user only if no users exist in the system."""
    import os
    import secrets

    if User.query.first():
        click.echo("  Admin: ya existen usuarios en el sistema, omitiendo")
        return

    admin_role = Role.query.filter_by(name="admin").first()
    if not admin_role:
        click.echo("  Admin: ERROR — rol 'admin' no encontrado")
        return

    admin_password = os.getenv("POS_ADMIN_PASSWORD")
    generated = False
    if not admin_password:
        admin_password = secrets.token_urlsafe(16)
        generated = True

    user = User(
        username="admin",
        email="admin@pos.local",
        full_name="Administrador",
        role_id=admin_role.id,
        must_change_password=True,
    )
    user.set_password(admin_password)
    db.session.add(user)
    db.session.flush()

    if generated:
        click.echo("  ================================================================")
        click.echo(f"  Admin creado con contraseña generada: {admin_password}")
        click.echo("  Guárdela ahora. Debe cambiarse en el primer inicio de sesión.")
        click.echo("  ================================================================")
    else:
        click.echo("  Admin: creado desde POS_ADMIN_PASSWORD (debe cambiarse en primer inicio)")



def seed_units():
    """Create default units of measure."""
    created = 0
    for name, abbr, fractions in UNITS:
        existing = UnitOfMeasure.query.filter_by(abbreviation=abbr).first()
        if existing:
            continue
        unit = UnitOfMeasure(name=name, abbreviation=abbr, allows_fractions=fractions)
        db.session.add(unit)
        created += 1

    db.session.flush()
    click.echo(f"  Unidades: {created} creadas, {len(UNITS) - created} existentes")


def seed_cash_register():
    """Create the default cash register."""
    existing = CashRegister.query.filter_by(name="Caja 1").first()
    if existing:
        click.echo("  Caja: ya existe")
        return

    register = CashRegister(name="Caja 1")
    db.session.add(register)
    db.session.flush()
    click.echo("  Caja: 'Caja 1' creada")


def seed_system_config():
    """Insert default system configuration values."""
    from app.services.config_service import seed_defaults
    seed_defaults()
    click.echo("  Configuracion: valores por defecto sembrados")


@click.command("seed")
@with_appcontext
def seed_command():
    """Populate the database with initial data."""
    click.echo("Sembrando datos iniciales...")

    perm_map = seed_permissions()
    seed_roles(perm_map)
    seed_admin_user()
    seed_units()
    seed_cash_register()
    seed_system_config()

    # Create folio sequences if they don't exist
    db.session.execute(db.text("CREATE SEQUENCE IF NOT EXISTS sale_folio_seq START 1"))
    db.session.execute(db.text("CREATE SEQUENCE IF NOT EXISTS purchase_order_folio_seq START 1"))

    db.session.commit()
    click.echo("Listo.")
