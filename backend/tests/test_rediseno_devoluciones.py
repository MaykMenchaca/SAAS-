"""Rediseño 5.4/5.5: `restock` en devoluciones, folio D-, y filtros/campos del historial de ventas."""
from decimal import Decimal

from app.models.audit import AuditLog
from app.models.inventory import Stock
from app.models.sale import SaleReturn


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _vender(client, token, session, product, qty=2, method="efectivo"):
    total = f"{Decimal('116.00') * qty:.2f}"
    resp = client.post(
        "/api/sales/",
        headers=_h(token),
        json={
            "session_id": session.id,
            "items": [{"product_id": product.id, "quantity": qty}],
            "payments": [{"method": method, "amount": total}],
        },
    )
    assert resp.status_code == 201, resp.get_json()
    data = resp.get_json()
    return data["id"], data["items"][0]["id"]


def _stock(db, product):
    db.session.expire_all()
    return Stock.query.filter_by(product_id=product.id).one().quantity


def _devolver(client, token, sale_id, item_id, session, **extra):
    body = {
        "reason": "Prueba",
        "session_id": session.id,
        "refund_method": "efectivo",
        "items": [{"sale_item_id": item_id, "quantity": "1"}],
        **extra,
    }
    return client.post(f"/api/sales/{sale_id}/return", headers=_h(token), json=body)


def test_restock_por_defecto_reingresa_stock(client, admin_token, db, seed_open_session, seed_product_for_sale):
    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    antes = _stock(db, seed_product_for_sale)
    resp = _devolver(client, admin_token, sale_id, item_id, seed_open_session)
    assert resp.status_code == 200
    assert resp.get_json()["restocked"] is True
    assert _stock(db, seed_product_for_sale) == antes + 1


def test_restock_true_reingresa_stock(client, admin_token, db, seed_open_session, seed_product_for_sale):
    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    antes = _stock(db, seed_product_for_sale)
    resp = _devolver(client, admin_token, sale_id, item_id, seed_open_session, restock=True)
    assert resp.status_code == 200
    assert _stock(db, seed_product_for_sale) == antes + 1


def test_restock_false_no_reingresa_stock_pero_reembolsa_igual(
    client, admin_token, db, seed_open_session, seed_product_for_sale
):
    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    sale_id2, item_id2 = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    r_true = _devolver(client, admin_token, sale_id, item_id, seed_open_session, restock=True)
    antes = _stock(db, seed_product_for_sale)
    r_false = _devolver(client, admin_token, sale_id2, item_id2, seed_open_session, restock=False)
    assert r_false.status_code == 200
    assert _stock(db, seed_product_for_sale) == antes  # no sube
    body = r_false.get_json()
    assert body["restocked"] is False
    assert body["refund_total"] == r_true.get_json()["refund_total"] == "116.00"
    # el corte de caja descuenta el efectivo igual: el reembolso en efectivo queda ligado a la sesión
    ret = db.session.get(SaleReturn, body["id"])
    assert ret.restocked is False
    assert ret.refund_total == Decimal("116.00")
    assert ret.refund_method == "efectivo"
    assert ret.session_id == seed_open_session.id


def test_restock_false_no_crea_movimiento_de_inventario(
    client, admin_token, db, seed_open_session, seed_product_for_sale
):
    from app.models.inventory import StockMovement

    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    resp = _devolver(client, admin_token, sale_id, item_id, seed_open_session, restock=False)
    rid = resp.get_json()["id"]
    assert StockMovement.query.filter_by(reference_type="devolucion", reference_id=rid).count() == 0


def test_restock_invalido_se_rechaza(client, admin_token, seed_open_session, seed_product_for_sale):
    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    resp = _devolver(client, admin_token, sale_id, item_id, seed_open_session, restock="quizas")
    assert resp.status_code == 422  # validación del schema


def test_auditoria_registra_restock(client, admin_token, db, seed_open_session, seed_product_for_sale):
    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    _devolver(client, admin_token, sale_id, item_id, seed_open_session, restock=False)
    log = AuditLog.query.filter_by(action="return", entity_type="sale", entity_id=sale_id).one()
    assert log.details["restock"] is False


def test_devoluciones_antiguas_valen_true(db, seed_open_session, seed_admin):
    """Una fila existente sin el dato (columna con default del servidor) cuenta como reingresada."""
    from app.models.sale import Sale

    sale = Sale(
        folio="V-ANT-0001", session_id=seed_open_session.id, user_id=seed_admin.id,
        subtotal=Decimal("1"), tax_total=Decimal("0"), total=Decimal("1"),
    )
    db.session.add(sale)
    db.session.flush()
    db.session.execute(
        db.text(
            "INSERT INTO sale_returns (sale_id, user_id, reason, refund_method, refund_total) "
            "VALUES (:s, :u, 'vieja', 'efectivo', 1)"
        ),
        {"s": sale.id, "u": seed_admin.id},
    )
    db.session.commit()
    assert SaleReturn.query.filter_by(sale_id=sale.id).one().restocked is True


def test_cancelar_venta_con_devolucion_sigue_prohibido(client, admin_token, seed_open_session, seed_product_for_sale):
    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    _devolver(client, admin_token, sale_id, item_id, seed_open_session, restock=False)
    resp = client.post(f"/api/sales/{sale_id}/cancel", headers=_h(admin_token), json={"reason": "No"})
    assert resp.status_code == 400
    assert "devoluc" in resp.get_json()["error"].lower()


def test_respuesta_expone_folio_de_devolucion(client, admin_token, seed_open_session, seed_product_for_sale):
    sale_id, item_id = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    body = _devolver(client, admin_token, sale_id, item_id, seed_open_session).get_json()
    assert body["folio"].startswith("D-")
    assert body["folio"].endswith(f"-{body['id']:04d}")


# ── Historial de ventas: filtros y campos ──────────────────────────────

def test_listado_filtra_por_cajero(client, admin_token, seed_open_session, seed_product_for_sale, seed_admin, seed_cajero):
    _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    propio = client.get(f"/api/sales/?user_id={seed_admin.id}", headers=_h(admin_token)).get_json()
    ajeno = client.get(f"/api/sales/?user_id={seed_cajero.id}", headers=_h(admin_token)).get_json()
    assert len(propio["items"]) == 1
    assert ajeno["items"] == []


def test_listado_filtra_por_fechas_locales(client, admin_token, seed_open_session, seed_product_for_sale):
    from app.utils.timeutil import local_today

    _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    hoy = local_today().isoformat()
    dentro = client.get(f"/api/sales/?date_from={hoy}&date_to={hoy}", headers=_h(admin_token)).get_json()
    fuera = client.get("/api/sales/?date_from=2000-01-01&date_to=2000-01-02", headers=_h(admin_token)).get_json()
    assert len(dentro["items"]) == 1
    assert fuera["items"] == []
    malo = client.get("/api/sales/?date_from=ayer", headers=_h(admin_token))
    assert malo.status_code == 400


def test_listado_expone_articulos_y_metodo(client, admin_token, seed_open_session, seed_product_for_sale):
    _vender(client, admin_token, seed_open_session, seed_product_for_sale, qty=3, method="tarjeta")
    item = client.get("/api/sales/", headers=_h(admin_token)).get_json()["items"][0]
    assert Decimal(item["items_count"]) == Decimal("3")
    assert item["payment_methods"] == ["tarjeta"]


def test_listado_de_cajeros(client, admin_token, seed_open_session, seed_product_for_sale, seed_admin):
    _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    resp = client.get("/api/sales/cashiers", headers=_h(admin_token))
    assert resp.status_code == 200
    assert resp.get_json() == [{"id": seed_admin.id, "username": "admin"}]
