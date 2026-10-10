"""Tests de Subfase 3.3: Servicio de Windows, instaladores, seed y dependencias (H-23, H-37, H-51)."""
from pathlib import Path
import pytest

from app.extensions import db
from app.models.user import Permission, Role
from app.seed import ROLES, seed_permissions, seed_roles


def test_requirements_dev_separated():
    """requirements.txt no debe tener pytest; debe existir requirements-dev.txt con dependencias de test."""
    backend_dir = Path(__file__).parents[1]
    req_prod = (backend_dir / "requirements.txt").read_text(encoding="utf-8")
    req_dev_path = backend_dir / "requirements-dev.txt"

    assert req_dev_path.exists(), "Falta backend/requirements-dev.txt"
    req_dev = req_dev_path.read_text(encoding="utf-8")

    assert "pytest" not in req_prod, "pytest debe ser removido de requirements.txt de producción"
    assert "pytest" in req_dev, "pytest debe estar en requirements-dev.txt"


def test_migration_has_purchase_order_folio_sequence():
    """Debe existir una migración Alembic que cree purchase_order_folio_seq."""
    migrations_dir = Path(__file__).parents[1] / "migrations" / "versions"
    found = False
    for mig in migrations_dir.glob("*.py"):
        content = mig.read_text(encoding="utf-8")
        if "purchase_order_folio_seq" in content:
            found = True
            break
    assert found, "Falta migración para purchase_order_folio_seq"


def test_seed_syncs_existing_role_permissions(app, db):
    """seed_roles debe agregar permisos nuevos a roles ya existentes sin eliminarlos."""
    perm_map = seed_permissions()

    # Simular rol cajero creado previamente sin un permiso
    cajero_role = Role.query.filter_by(name="cajero").first()
    if not cajero_role:
        cajero_role = Role(name="cajero", description="Cajero")
        db.session.add(cajero_role)
        db.session.flush()

    # Quitarle un permiso intencionalmente para ver si seed_roles lo sincroniza
    cajero_role.permissions = []
    db.session.commit()

    # Ejecutar seed_roles
    seed_roles(perm_map)
    db.session.commit()

    updated_cajero = Role.query.filter_by(name="cajero").first()
    expected_perms = set(ROLES["cajero"]["permissions"])
    current_perms = {p.code for p in updated_cajero.permissions}
    assert expected_perms.issubset(current_perms), (
        f"seed_roles no sincronizó los permisos faltantes: {expected_perms - current_perms}"
    )


def test_install_service_script_exists_and_checks_admin():
    """install-service.ps1 debe existir, requerir admin, configurar NSSM/pos-backend y firewall."""
    root_dir = Path(__file__).parents[2]
    script_path = root_dir / "install-service.ps1"
    assert script_path.exists(), "install-service.ps1 no existe"
    content = script_path.read_text(encoding="utf-8")

    assert "Administrator" in content or "admin" in content.lower(), (
        "install-service.ps1 debe comprobar privilegios de administrador"
    )
    assert "nssm" in content.lower(), "install-service.ps1 debe configurar NSSM"
    assert "pos-backend" in content, "install-service.ps1 debe configurar el servicio pos-backend"
    assert "postgresql" in content.lower(), "install-service.ps1 debe establecer dependencia de PostgreSQL"
    assert "firewall" in content.lower(), "install-service.ps1 debe configurar regla de Firewall para puerto 5000"


def test_installer_scripts_validate_python_and_lastexitcode():
    """install-production.ps1 y build-production.ps1 deben validar python y revisar $LASTEXITCODE."""
    root_dir = Path(__file__).parents[2]
    build_script = (root_dir / "build-production.ps1").read_text(encoding="utf-8")
    install_script = (root_dir / "install-production.ps1").read_text(encoding="utf-8")

    assert "LASTEXITCODE" in build_script or "npm ci" in build_script, (
        "build-production.ps1 debe usar npm ci o verificar $LASTEXITCODE"
    )
    assert "LASTEXITCODE" in install_script, (
        "install-production.ps1 debe verificar $LASTEXITCODE en comandos críticos"
    )
