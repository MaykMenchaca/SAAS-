"""Catálogo local del POS y búsqueda exacta por código (Subfase 4.8, OPS-02, OPS-14)."""
from decimal import Decimal

import pytest


@pytest.fixture
def productos(db):
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()
    datos = [
        ("TOR-1", "7501000000011", "Tornillo 1", True),
        ("TOR-10", "7501000000101", "Tornillo 10", True),
        ("VIEJO-1", "7501000000999", "Producto inactivo", False),
    ]
    out = []
    for sku, barcode, name, active in datos:
        p = Product(sku=sku, barcode=barcode, name=name, unit_id=unit.id,
                    sale_price=Decimal("12.50"), tax_rate=Decimal("16.00"), is_active=active)
        db.session.add(p)
        out.append(p)
    db.session.commit()
    return out


def _get(client, token, url):
    return client.get(url, headers={"Authorization": f"Bearer {token}"})


@pytest.mark.parametrize("code, sku", [("TOR-1", "TOR-1"), ("TOR-10", "TOR-10"), ("7501000000011", "TOR-1"), ("tor-1", "TOR-1")])
def test_busqueda_exacta_por_codigo(client, admin_token, productos, code, sku):
    response = _get(client, admin_token, f"/api/products/by-code/{code}")
    assert response.status_code == 200
    assert response.get_json()["sku"] == sku


def test_codigo_inexistente_o_inactivo_da_404(client, admin_token, productos):
    assert _get(client, admin_token, "/api/products/by-code/TOR").status_code == 404
    assert _get(client, admin_token, "/api/products/by-code/VIEJO-1").status_code == 404


def test_catalogo_pos_compacto_solo_activos(client, regular_user_token, productos):
    response = _get(client, regular_user_token, "/api/products/pos-catalog")
    assert response.status_code == 200
    data = response.get_json()
    assert {p["sku"] for p in data["items"]} == {"TOR-1", "TOR-10"}
    item = next(p for p in data["items"] if p["sku"] == "TOR-1")
    assert set(item) == {"id", "sku", "barcode", "name", "sale_price", "tax_rate", "category_id", "unit"}
    assert item["sale_price"] == "12.50"
    assert item["unit"]["abbreviation"] == "pz"
    assert "generated_at" in data


def test_catalogo_requiere_autenticacion(client, productos):
    assert client.get("/api/products/pos-catalog").status_code == 401
