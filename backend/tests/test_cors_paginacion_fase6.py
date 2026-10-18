"""CORS restringido y paginación de listados (Subfase 6.4, H-35, H-45)."""
from decimal import Decimal

import pytest


def _get(client, token, url, **kwargs):
    return client.get(url, headers={"Authorization": f"Bearer {token}", **kwargs.pop("headers", {})}, **kwargs)


# ── CORS ───────────────────────────────────────────────────────────────────

def test_sin_cors_origins_no_se_permite_otro_origen(client):
    response = client.get("/api/health", headers={"Origin": "http://sitio-malicioso.example"})
    assert "Access-Control-Allow-Origin" not in response.headers


def test_cors_origins_configurado_permite_solo_esos_origenes():
    from app import create_app
    from app.config import TestConfig

    class ConCors(TestConfig):
        CORS_ORIGINS = "http://192.168.1.20:3000, http://caja2.local:3000"

    app = create_app(ConCors)
    client = app.test_client()
    ok = client.get("/api/health", headers={"Origin": "http://192.168.1.20:3000"})
    assert ok.headers.get("Access-Control-Allow-Origin") == "http://192.168.1.20:3000"
    malo = client.get("/api/health", headers={"Origin": "http://sitio-malicioso.example"})
    assert "Access-Control-Allow-Origin" not in malo.headers


# ── Paginación ─────────────────────────────────────────────────────────────

def test_sesiones_paginadas_y_filtradas_por_estado(client, admin_token, db, seed_admin, seed_cash_register):
    from app.models.sale import CashRegisterSession

    for i in range(3):
        db.session.add(CashRegisterSession(cash_register_id=seed_cash_register.id, user_id=seed_admin.id,
                                           opening_amount=Decimal("0"), status="cerrada"))
    db.session.add(CashRegisterSession(cash_register_id=seed_cash_register.id, user_id=seed_admin.id,
                                       opening_amount=Decimal("0"), status="abierta"))
    db.session.commit()

    data = _get(client, admin_token, "/api/cash-register/sessions", query_string={"per_page": 2}).get_json()
    assert data["total"] == 4 and len(data["items"]) == 2 and data["pages"] == 2

    abiertas = _get(client, admin_token, "/api/cash-register/sessions", query_string={"status": "abierta"}).get_json()
    assert [s["status"] for s in abiertas["items"]] == ["abierta"]


def test_stock_bajo_paginado(client, admin_token, db):
    from app.models.inventory import Stock
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()
    for i in range(3):
        p = Product(sku=f"LOW-{i}", name=f"Bajo {i}", unit_id=unit.id, sale_price=Decimal("1"), min_stock=Decimal("10"))
        db.session.add(p)
        db.session.flush()
        db.session.add(Stock(product_id=p.id, quantity=Decimal(i)))
    db.session.commit()

    data = _get(client, admin_token, "/api/inventory/low-stock", query_string={"per_page": 2}).get_json()
    assert data["total"] == 3 and len(data["items"]) == 2
    assert [Decimal(s["quantity"]) for s in data["items"]] == [Decimal("0"), Decimal("1")]


def test_proveedores_paginados(client, admin_token, db):
    from app.models.purchase import Supplier

    for i in range(3):
        db.session.add(Supplier(name=f"Proveedor {i}", is_active=True))
    db.session.commit()

    data = _get(client, admin_token, "/api/purchases/suppliers", query_string={"per_page": 2, "page": 2}).get_json()
    assert data["total"] == 3 and data["page"] == 2 and len(data["items"]) == 1
