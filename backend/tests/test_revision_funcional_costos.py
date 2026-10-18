"""Revisión funcional 2026-10, costo promedio: RF-07 (avg_cost en 0 diluye las recepciones)."""
from decimal import Decimal

import pytest

from app.models.product import Product


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def unidad(db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.commit()
    return unit


def _alta(client, token, unidad, sku, purchase_price=None):
    body = {"sku": sku, "name": f"Producto {sku}", "unit_id": unidad.id, "sale_price": "100.00", "tax_rate": "16.00"}
    if purchase_price is not None:
        body["purchase_price"] = purchase_price
    resp = client.post("/api/products/", headers=_h(token), json=body)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["id"]


def _ajustar(client, token, product_id, cantidad):
    resp = client.post("/api/inventory/adjust", headers=_h(token),
                       json={"product_id": product_id, "quantity": cantidad, "reason": "otro", "notes": "carga"})
    assert resp.status_code in (200, 201), resp.get_json()


def _recibir(client, token, product_id, qty, costo):
    order = client.post("/api/purchases/orders", headers=_h(token),
                        json={"items": [{"product_id": product_id, "quantity": qty, "unit_cost": costo}]})
    assert order.status_code == 201, order.get_json()
    order = order.get_json()
    assert client.post(f"/api/purchases/orders/{order['id']}/send", headers=_h(token)).status_code == 200
    resp = client.post(f"/api/purchases/orders/{order['id']}/receive", headers=_h(token),
                       json={"items": [{"order_item_id": order["items"][0]["id"], "received_quantity": qty}]})
    assert resp.status_code == 200, resp.get_json()


def _avg(db, product_id):
    db.session.expire_all()
    return db.session.get(Product, product_id).avg_cost


def test_rf07_poner_precio_de_compra_despues_fija_el_costo_promedio_si_estaba_en_0(client, admin_token, db, unidad):
    pid = _alta(client, admin_token, unidad, "SIN-COSTO")
    assert _avg(db, pid) == Decimal("0")
    resp = client.patch(f"/api/products/{pid}", headers=_h(admin_token), json={"purchase_price": "40.00"})
    assert resp.status_code == 200
    assert _avg(db, pid) == Decimal("40.00")


def test_rf07_el_precio_de_compra_no_pisa_un_costo_promedio_ya_calculado(client, admin_token, db, unidad):
    pid = _alta(client, admin_token, unidad, "CON-COSTO", "50.00")
    _ajustar(client, admin_token, pid, "10")
    client.patch(f"/api/products/{pid}", headers=_h(admin_token), json={"purchase_price": "70.00"})
    assert _avg(db, pid) == Decimal("50.00")


def test_rf07_unidades_sin_costo_no_diluyen_la_recepcion(client, admin_token, db, unidad):
    # 30 unidades cargadas por ajuste sin costo conocido; luego llegan 10 a $40
    pid = _alta(client, admin_token, unidad, "DILUYE")
    _ajustar(client, admin_token, pid, "30")
    _recibir(client, admin_token, pid, "10", "40.00")
    assert _avg(db, pid) == Decimal("40.0000")  # antes: (30×0 + 10×40) / 40 = 10


def test_rf07_el_promedio_ponderado_normal_no_cambia(client, admin_token, db, unidad):
    pid = _alta(client, admin_token, unidad, "NORMAL", "56.00")
    _ajustar(client, admin_token, pid, "10")
    _recibir(client, admin_token, pid, "10", "60.00")
    assert _avg(db, pid) == Decimal("58.0000")
