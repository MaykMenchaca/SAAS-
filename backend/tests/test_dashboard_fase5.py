"""Dashboard con datos reales (Subfase 5.1, H-27)."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.utils import timeutil

# Hoy simulado: 2026-10-15 12:00 en Ciudad de México (18:00 UTC)
AHORA = datetime(2026, 10, 15, 18, 0, tzinfo=timezone.utc)


@pytest.fixture
def reloj(monkeypatch):
    monkeypatch.setattr(timeutil, "utc_now", lambda: AHORA)


def _vender(client, token, session_id, product_id, cuando, db):
    from app.models.sale import Sale

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
    sale = db.session.get(Sale, response.get_json()["id"])
    sale.created_at = cuando
    db.session.commit()


def test_dashboard_incluye_periodo_anterior(
    client, admin_token, seed_open_session, seed_product_for_sale, db, reloj
):
    ayer = datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc)
    mes_pasado = datetime(2026, 9, 10, 18, 0, tzinfo=timezone.utc)
    mes_pasado_fuera = datetime(2026, 9, 20, 18, 0, tzinfo=timezone.utc)  # después del día 15
    for cuando in (AHORA, ayer, ayer, mes_pasado, mes_pasado_fuera):
        _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, cuando, db)

    data = client.get(
        "/api/reports/dashboard", headers={"Authorization": f"Bearer {admin_token}"}
    ).get_json()

    assert data["sales_today"] == 1
    assert data["sales_prev_day"] == 2
    assert Decimal(data["revenue_prev_day"]) == Decimal("232.00")
    # Mismo tramo del mes anterior (1 al 15 de septiembre): solo la venta del día 10
    assert data["sales_prev_month"] == 1
    assert Decimal(data["revenue_prev_month"]) == Decimal("116.00")


def test_dashboard_lista_sesiones_abiertas(
    client, admin_token, seed_open_session, seed_product_for_sale, db, reloj
):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, AHORA, db)

    data = client.get(
        "/api/reports/dashboard", headers={"Authorization": f"Bearer {admin_token}"}
    ).get_json()

    assert data["open_sessions"] == [{
        "id": seed_open_session.id,
        "register": "Caja 1",
        "user_id": seed_open_session.user_id,
        "user": "Admin User",
        "opened_at": data["open_sessions"][0]["opened_at"],
        "revenue": "116.00",
        "count": 1,
    }]


def test_dashboard_sin_sesiones_abiertas(client, admin_token, db, reloj):
    data = client.get(
        "/api/reports/dashboard", headers={"Authorization": f"Bearer {admin_token}"}
    ).get_json()
    assert data["open_sessions"] == []
