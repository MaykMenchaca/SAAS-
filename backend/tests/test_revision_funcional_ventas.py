"""Revisión funcional 2026-10, ventas y devoluciones: RF-02, RF-03 (cantidades) y RF-04 (reembolso acumulado)."""
from decimal import Decimal

import pytest

from app.models.inventory import Stock
from app.models.sale import Sale, SaleReturn


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def granel(db):
    """Producto a granel (kg, admite fracciones) con 50 kg de existencia."""
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Kilogramo", abbreviation="kg", allows_fractions=True)
    db.session.add(unit)
    db.session.flush()
    p = Product(sku="CLAVO-KG", name="Clavo a granel", unit_id=unit.id, sale_price=Decimal("40.00"),
                avg_cost=Decimal("25.00"), tax_rate=Decimal("16.00"))
    db.session.add(p)
    db.session.flush()
    db.session.add(Stock(product_id=p.id, quantity=Decimal("50.000")))
    db.session.commit()
    return p


@pytest.fixture
def barato(db):
    """Producto por pieza de $1.05 + IVA (el redondeo por pieza da 1.218 → 1.22)."""
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()
    p = Product(sku="ROND-1", name="Rondana", unit_id=unit.id, sale_price=Decimal("1.05"),
                avg_cost=Decimal("0.50"), tax_rate=Decimal("16.00"))
    db.session.add(p)
    db.session.flush()
    db.session.add(Stock(product_id=p.id, quantity=Decimal("100.000")))
    db.session.commit()
    return p


def _stock(db, product):
    db.session.expire_all()
    return Stock.query.filter_by(product_id=product.id).one().quantity


def _vender(client, token, session, product, qty, amount="10000.00"):
    return client.post("/api/sales/", headers=_h(token), json={
        "session_id": session.id,
        "items": [{"product_id": product.id, "quantity": str(qty)}],
        "payments": [{"method": "efectivo", "amount": amount}],
    })


def _devolver(client, token, session, sale_id, item_id, qty):
    return client.post(f"/api/sales/{sale_id}/return", headers=_h(token), json={
        "reason": "Prueba RF", "session_id": session.id, "refund_method": "efectivo",
        "items": [{"sale_item_id": item_id, "quantity": str(qty)}],
    })


# ── RF-02: devoluciones fraccionarias de productos por pieza ─────────────────────────────

def test_rf02_no_se_devuelve_media_pieza(client, admin_token, db, seed_open_session, seed_product_for_sale):
    venta = _vender(client, admin_token, seed_open_session, seed_product_for_sale, 2).get_json()
    antes = _stock(db, seed_product_for_sale)
    resp = _devolver(client, admin_token, seed_open_session, venta["id"], venta["items"][0]["id"], "0.5")
    assert resp.status_code in (400, 422)
    assert _stock(db, seed_product_for_sale) == antes
    assert SaleReturn.query.count() == 0


def test_rf02_un_producto_a_granel_si_se_devuelve_fraccionario(client, admin_token, db, seed_open_session, granel):
    venta = _vender(client, admin_token, seed_open_session, granel, "2.5").get_json()
    resp = _devolver(client, admin_token, seed_open_session, venta["id"], venta["items"][0]["id"], "1.25")
    assert resp.status_code == 200
    assert _stock(db, granel) == Decimal("48.750")


# ── RF-03: cantidades con más de 3 decimales ─────────────────────────────────────────────

@pytest.mark.parametrize("qty", ["2.0004", "0.0004", "1.12345"])
def test_rf03_venta_con_mas_de_3_decimales_se_rechaza(client, admin_token, db, seed_open_session, granel, qty):
    resp = _vender(client, admin_token, seed_open_session, granel, qty)
    assert resp.status_code == 422, resp.get_json()
    assert Sale.query.count() == 0
    assert _stock(db, granel) == Decimal("50.000")


def test_rf03_cotizacion_con_mas_de_3_decimales_se_rechaza(client, admin_token, seed_open_session, granel):
    resp = client.post("/api/sales/quote", headers=_h(admin_token), json={
        "session_id": seed_open_session.id, "items": [{"product_id": granel.id, "quantity": "2.0004"}]})
    assert resp.status_code == 422


def test_rf03_tres_decimales_cuadran_precio_partida_y_stock(client, admin_token, db, seed_open_session, granel):
    venta = _vender(client, admin_token, seed_open_session, granel, "2.001").get_json()
    assert venta["items"][0]["quantity"] == "2.001"
    # 2.001 × 40 = 80.04 + 16 % = 92.85 (HALF_EVEN de 92.8464)
    assert Decimal(venta["total"]) == Decimal("92.85")
    assert _stock(db, granel) == Decimal("47.999")
    # Un ciclo venta-devolución deja el stock exactamente igual (sin +0.001 fantasma)
    resp = _devolver(client, admin_token, seed_open_session, venta["id"], venta["items"][0]["id"], "2.001")
    assert resp.status_code == 200
    assert _stock(db, granel) == Decimal("50.000")


def test_rf03_devolucion_con_mas_de_3_decimales_se_rechaza(client, admin_token, db, seed_open_session, granel):
    venta = _vender(client, admin_token, seed_open_session, granel, "2").get_json()
    resp = _devolver(client, admin_token, seed_open_session, venta["id"], venta["items"][0]["id"], "0.0004")
    assert resp.status_code == 422
    assert SaleReturn.query.count() == 0


# ── RF-04: la suma de reembolsos parciales no excede lo cobrado ──────────────────────────

def test_rf04_tres_devoluciones_de_una_pieza_reembolsan_exactamente_el_total(client, admin_token, db, seed_open_session, barato):
    venta = _vender(client, admin_token, seed_open_session, barato, 3).get_json()
    assert Decimal(venta["total"]) == Decimal("3.65")  # 3.15 + 0.50 de IVA (HALF_EVEN de 0.504)
    item_id = venta["items"][0]["id"]
    reembolsos = []
    for _ in range(3):
        resp = _devolver(client, admin_token, seed_open_session, venta["id"], item_id, 1)
        assert resp.status_code == 200, resp.get_json()
        reembolsos.append(Decimal(resp.get_json()["refund_total"]))
    assert sum(reembolsos) == Decimal("3.65")
    assert all(r in (Decimal("1.21"), Decimal("1.22")) for r in reembolsos)


def test_rf04_devolucion_total_de_una_vez_reembolsa_el_total(client, admin_token, db, seed_open_session, barato):
    venta = _vender(client, admin_token, seed_open_session, barato, 3).get_json()
    resp = _devolver(client, admin_token, seed_open_session, venta["id"], venta["items"][0]["id"], 3)
    assert Decimal(resp.get_json()["refund_total"]) == Decimal("3.65")


def test_rf04_con_descuento_y_varias_partidas_nunca_excede_lo_cobrado(client, admin_token, db, seed_open_session, barato, granel):
    resp = client.post("/api/sales/", headers=_h(admin_token), json={
        "session_id": seed_open_session.id,
        "items": [{"product_id": barato.id, "quantity": "7", "discount_percent": "10"},
                  {"product_id": granel.id, "quantity": "1.333"}],
        "payments": [{"method": "efectivo", "amount": "1000.00"}],
    })
    venta = resp.get_json()
    assert resp.status_code == 201, venta
    total = Decimal(venta["total"])
    pagado = Decimal("0")
    for item in venta["items"]:
        qty = Decimal(item["quantity"])
        paso = Decimal("1") if qty == qty.to_integral_value() else Decimal("0.333")
        restante = qty
        while restante > 0:
            q = min(paso, restante)
            r = _devolver(client, admin_token, seed_open_session, venta["id"], item["id"], q)
            assert r.status_code == 200, r.get_json()
            pagado += Decimal(r.get_json()["refund_total"])
            restante -= q
    assert pagado <= total
    # La devolución completa por partes cuadra al centavo con lo cobrado
    assert total - pagado <= Decimal("0.01")
