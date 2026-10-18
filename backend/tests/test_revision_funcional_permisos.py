"""Revisión funcional 2026-10, permisos: RF-08 (desactivar por PATCH sin `productos:desactivar`)."""
from decimal import Decimal

import pytest

from app.models.audit import AuditLog
from app.models.product import Category, Product, UnitOfMeasure
from app.models.user import Role, User


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def gerente_token(client, db, seed_roles, seed_permissions):
    # Como el gerente de la siembra real: puede ver y editar el catálogo, pero no desactivar
    rol = Role(name="gerente_catalogo", description="Gerente (catálogo)")
    rol.permissions.extend([seed_permissions["productos:ver"], seed_permissions["productos:editar"]])
    db.session.add(rol)
    db.session.flush()
    user = User(username="gerente1", email="gerente1@test.com", full_name="Gerente", role_id=rol.id)
    user.set_password("gerente123")
    db.session.add(user)
    db.session.commit()
    assert "productos:editar" in user.permissions and "productos:desactivar" not in user.permissions
    return client.post("/api/auth/login", json={"username": "gerente1", "password": "gerente123"}).get_json()["access_token"]


@pytest.fixture
def catalogo(db):
    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    cat = Category(name="Herramientas")
    db.session.add_all([unit, cat])
    db.session.flush()
    p = Product(sku="MAR-1", name="Martillo", unit_id=unit.id, category_id=cat.id, sale_price=Decimal("100.00"))
    db.session.add(p)
    db.session.commit()
    return p, cat


def _activo(db, model, obj_id):
    db.session.expire_all()
    return db.session.get(model, obj_id).is_active


def test_rf08_gerente_no_desactiva_producto_por_patch(client, db, gerente_token, catalogo):
    producto, _ = catalogo
    resp = client.patch(f"/api/products/{producto.id}", headers=_h(gerente_token), json={"is_active": False})
    assert resp.status_code == 403
    assert _activo(db, Product, producto.id) is True


def test_rf08_gerente_no_desactiva_categoria_por_patch(client, db, gerente_token, catalogo):
    _, categoria = catalogo
    resp = client.patch(f"/api/categories/{categoria.id}", headers=_h(gerente_token), json={"is_active": False})
    assert resp.status_code == 403
    assert _activo(db, Category, categoria.id) is True


def test_rf08_gerente_si_edita_otros_campos(client, db, gerente_token, catalogo):
    producto, categoria = catalogo
    assert client.patch(f"/api/products/{producto.id}", headers=_h(gerente_token), json={"name": "Martillo 16 oz"}).status_code == 200
    # Mandar is_active sin cambiarlo no es desactivar
    assert client.patch(f"/api/products/{producto.id}", headers=_h(gerente_token),
                        json={"is_active": True, "name": "Martillo"}).status_code == 200
    assert client.patch(f"/api/categories/{categoria.id}", headers=_h(gerente_token), json={"name": "Herramienta"}).status_code == 200


def test_rf08_admin_desactiva_por_patch_y_queda_auditado_como_desactivar(client, db, admin_token, catalogo):
    producto, _ = catalogo
    resp = client.patch(f"/api/products/{producto.id}", headers=_h(admin_token), json={"is_active": False})
    assert resp.status_code == 200
    assert _activo(db, Product, producto.id) is False
    acciones = [a.action for a in AuditLog.query.filter_by(entity_type="product", entity_id=producto.id).all()]
    assert "desactivar" in acciones and "editar" not in acciones
    resp = client.patch(f"/api/products/{producto.id}", headers=_h(admin_token), json={"is_active": True})
    assert resp.status_code == 200
    assert _activo(db, Product, producto.id) is True
