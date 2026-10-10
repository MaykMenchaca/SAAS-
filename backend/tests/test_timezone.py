"""Tests de la zona horaria de la tienda (Subfase 4.1, H-21).

La tienda opera en America/Mexico_City (UTC-6, sin horario de verano desde 2022).
Una venta a las 19:30 hora local ya es el día siguiente en UTC; debe contar en el
día local en reportes, dashboard y folios.
"""
from datetime import date, datetime, timezone

import pytest

from app.utils import timeutil

# 2026-10-06 19:30 en Ciudad de México == 2026-10-07 01:30 UTC
VENTA_19H_UTC = datetime(2026, 10, 7, 1, 30, tzinfo=timezone.utc)
# "Ahora" simulado: 2026-10-06 20:00 en Ciudad de México == 2026-10-07 02:00 UTC
AHORA_20H_UTC = datetime(2026, 10, 7, 2, 0, tzinfo=timezone.utc)


@pytest.fixture
def reloj_20h(monkeypatch):
    monkeypatch.setattr(timeutil, "utc_now", lambda: AHORA_20H_UTC)
    return AHORA_20H_UTC


def _vender(client, token, session_id, product_id):
    response = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "session_id": session_id,
            "items": [{"product_id": product_id, "quantity": 1}],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
        },
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def test_local_day_bounds_mexico():
    start, end = timeutil.local_day_bounds(date(2026, 10, 6))
    assert start == datetime(2026, 10, 6, 6, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 10, 7, 6, 0, tzinfo=timezone.utc)


def test_local_today_con_reloj_inyectado(reloj_20h):
    assert timeutil.local_today() == date(2026, 10, 6)


def test_venta_19h_cuenta_en_dia_local(
    client, admin_token, seed_open_session, seed_product_for_sale, db, reloj_20h
):
    from app.models.sale import Sale

    data = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    sale = db.session.get(Sale, data["id"])
    sale.created_at = VENTA_19H_UTC
    db.session.commit()

    headers = {"Authorization": f"Bearer {admin_token}"}

    dashboard = client.get("/api/reports/dashboard", headers=headers).get_json()
    assert dashboard["sales_today"] == 1

    report = client.get(
        "/api/reports/sales?from=2026-10-06&to=2026-10-06", headers=headers
    ).get_json()
    assert report["total_sales"] == 1
    assert [d["date"] for d in report["daily"]] == ["2026-10-06"]

    siguiente = client.get(
        "/api/reports/sales?from=2026-10-07&to=2026-10-07", headers=headers
    ).get_json()
    assert siguiente["total_sales"] == 0


def test_reporte_sin_fechas_usa_dia_local(client, admin_token, db, reloj_20h):
    report = client.get(
        "/api/reports/sales", headers={"Authorization": f"Bearer {admin_token}"}
    ).get_json()
    assert report["period"]["to"] == "2026-10-06"


def test_folio_usa_fecha_local(
    client, admin_token, seed_open_session, seed_product_for_sale, db, reloj_20h
):
    data = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    assert data["folio"].startswith("V-20261006-")


def test_folio_orden_compra_usa_fecha_local(db, reloj_20h):
    from app.services.purchase_order_service import PurchaseOrderService

    assert PurchaseOrderService._generate_folio().startswith("OC-20261006-")


def test_ticket_muestra_hora_local(
    client, admin_token, seed_open_session, seed_product_for_sale, db
):
    from app.models.sale import Sale
    from app.services.printer_service import PrinterService

    data = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    sale = db.session.get(Sale, data["id"])
    sale.created_at = VENTA_19H_UTC
    db.session.commit()

    # El ticket no debe depender de la zona horaria configurada en PostgreSQL.
    db.session.execute(db.text("SET TIME ZONE 'UTC'"))
    db.session.refresh(sale)

    assert "2026-10-06 19:30" in PrinterService.format_sale_ticket(sale)
