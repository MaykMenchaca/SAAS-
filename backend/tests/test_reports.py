"""Tests for dashboard and report endpoints."""


def test_dashboard_returns_kpis(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Dashboard should return KPI data even with no sales."""
    response = client.get(
        "/api/reports/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert "sales_today" in data
    assert "revenue_today" in data
    assert "sales_week" in data
    assert "revenue_week" in data
    assert "top_products" in data
    assert "low_stock_count" in data


def test_dashboard_reflects_sales(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Dashboard KPIs should reflect created sales."""
    # Create a sale
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 2,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "232.00"}],
        },
    )

    response = client.get(
        "/api/reports/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["sales_today"] >= 1
    assert float(data["revenue_today"]) > 0


def test_dashboard_requires_permission(client, db):
    response = client.get("/api/reports/dashboard")
    assert response.status_code == 401
