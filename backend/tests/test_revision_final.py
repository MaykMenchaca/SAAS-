"""Hallazgos de la re-revisión final (cierre del plan)."""
from decimal import Decimal

import pytest


@pytest.fixture
def producto_por_metro(db):
    from app.models.inventory import Stock
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Metro", abbreviation="m", allows_fractions=True)
    db.session.add(unit)
    db.session.flush()
    product = Product(sku="CABLE-12", name="Cable calibre 12", unit_id=unit.id,
                      sale_price=Decimal("12.99"), tax_rate=Decimal("16.00"))
    db.session.add(product)
    db.session.flush()
    db.session.add(Stock(product_id=product.id, quantity=Decimal("100")))
    db.session.commit()
    return product


# ── FE-103: cantidades fraccionarias con total en centavos exactos ─────────

def test_total_con_fraccion_queda_en_centavos(client, admin_token, seed_open_session, producto_por_metro):
    headers = {"Authorization": f"Bearer {admin_token}"}
    items = [{"product_id": producto_por_metro.id, "quantity": "1.500"}]

    quote = client.post("/api/sales/quote", json={"items": items}, headers=headers).get_json()
    # 1.5 × 12.99 = 19.485 → 19.48 (HALF_EVEN por línea); IVA 16 % = 3.12; total 22.60
    assert quote["subtotal"] == "19.48" and quote["tax_total"] == "3.12" and quote["total"] == "22.60"

    for method in ("efectivo", "tarjeta"):
        response = client.post(
            "/api/sales/",
            json={"session_id": seed_open_session.id, "items": items,
                  "payments": [{"method": method, "amount": quote["total"], "reference": "1234"}]},
            headers=headers,
        )
        assert response.status_code == 201, (method, response.get_json())
        assert response.get_json()["total"] == "22.60"
