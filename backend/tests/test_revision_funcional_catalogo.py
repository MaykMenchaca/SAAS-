"""Revisión funcional 2026-10, catálogo: RF-01 (escaneo devuelve el producto equivocado)."""
from decimal import Decimal

import pytest


@pytest.fixture
def unidad(db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.commit()
    return unit


def _producto(db, unidad, sku, barcode, precio):
    from app.models.product import Product

    p = Product(sku=sku, barcode=barcode, name=f"Producto {sku}", unit_id=unidad.id,
                sale_price=Decimal(precio), tax_rate=Decimal("16.00"))
    db.session.add(p)
    db.session.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("barcode_del_otro", [None, "7509999999999"])
def test_rf01_el_codigo_de_barras_gana_aunque_el_otro_producto_no_tenga_codigo(client, admin_token, db, unidad, barcode_del_otro):
    # A tiene barcode X; B tiene sku X (con o sin código de barras propio). Escanear X debe dar A.
    a = _producto(db, unidad, "A-001", "X123", "35.00")
    _producto(db, unidad, "X123", barcode_del_otro, "8.00")

    resp = client.get("/api/products/by-code/X123", headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["id"] == a.id
    assert resp.get_json()["sale_price"] == "35.00"


def _payload(unidad, sku, barcode=None):
    return {"sku": sku, "barcode": barcode, "name": f"Nuevo {sku}", "unit_id": unidad.id, "sale_price": "10.00", "tax_rate": "16.00"}


def test_rf01_no_se_puede_crear_un_sku_igual_al_codigo_de_barras_de_otro(client, admin_token, db, unidad):
    _producto(db, unidad, "A-001", "7501000000011", "10.00")
    resp = client.post("/api/products/", json=_payload(unidad, "7501000000011"), headers=_auth(admin_token))
    assert resp.status_code == 422
    assert "sku" in resp.get_json()["details"]


def test_rf01_no_se_puede_crear_un_codigo_de_barras_igual_al_sku_de_otro(client, admin_token, db, unidad):
    _producto(db, unidad, "TOR-1", None, "10.00")
    resp = client.post("/api/products/", json=_payload(unidad, "NUEVO-1", "tor-1"), headers=_auth(admin_token))
    assert resp.status_code == 422
    assert "barcode" in resp.get_json()["details"]


def test_rf01_tampoco_al_editar(client, admin_token, db, unidad):
    _producto(db, unidad, "A-001", "7501000000011", "10.00")
    b = _producto(db, unidad, "B-001", None, "10.00")
    resp = client.patch(f"/api/products/{b.id}", json={"sku": "7501000000011"}, headers=_auth(admin_token))
    assert resp.status_code == 422


def test_rf01_un_producto_puede_tener_su_propio_sku_igual_a_su_codigo(client, admin_token, db, unidad):
    resp = client.post("/api/products/", json=_payload(unidad, "7501000000011", "7501000000011"), headers=_auth(admin_token))
    assert resp.status_code == 201
