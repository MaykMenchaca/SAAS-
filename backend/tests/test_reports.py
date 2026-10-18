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


# --- Task 31: Sales report ---


def test_sales_report_structure(client, admin_token, db):
    """Sales report should return period, totals, daily, and payment breakdown."""
    response = client.get(
        "/api/reports/sales",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert "period" in data
    assert "total_sales" in data
    assert "total_revenue" in data
    assert "cancelled_sales" in data
    assert "daily" in data
    assert "payment_methods" in data


def test_sales_report_with_data(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Sales report should reflect sale data."""
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 3,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "348.00"}],
        },
    )

    response = client.get(
        "/api/reports/sales",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = response.get_json()
    assert data["total_sales"] == 1
    assert float(data["total_revenue"]) > 0
    assert len(data["daily"]) == 1
    assert len(data["payment_methods"]) == 1
    assert data["payment_methods"][0]["method"] == "efectivo"


def test_sales_report_date_filter(client, admin_token, db):
    """Sales report should accept from/to date params."""
    response = client.get(
        "/api/reports/sales?from=2025-01-01&to=2025-01-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["period"]["from"] == "2025-01-01"
    assert data["period"]["to"] == "2025-01-31"
    assert data["total_sales"] == 0


# --- Task 32: Inventory valuation ---


def test_inventory_valuation(client, admin_token, seed_product_for_sale, db):
    """Inventory valuation should show stock * avg_cost per product."""
    response = client.get(
        "/api/reports/inventory-valuation",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["product_count"] == 1
    assert len(data["items"]) == 1
    item = data["items"][0]
    # 100 units * $60.00 avg_cost = $6000.00
    assert item["quantity"] == "100.000"
    assert item["avg_cost"] == "60.00"
    assert item["valuation"] == "6000.00"
    assert data["total_valuation"] == "6000.00"


# --- Task 33: Top products ---


def test_top_products_report(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Top products report should rank products by quantity or revenue."""
    # Create a sale
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 5,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "580.00"}],
        },
    )

    response = client.get(
        "/api/reports/top-products",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["items"]) == 1
    assert data["items"][0]["product_name"] == "Martillo"
    assert data["items"][0]["total_quantity"] == "5.000"
    assert data["items"][0]["sale_count"] == 1


# --- Task 34: Gross margin ---


def test_gross_margin_report(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Gross margin report should show revenue vs cost breakdown."""
    # Create a sale (product has avg_cost=60, sold at 100)
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
        "/api/reports/gross-margin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()

    # Revenue: 2*100 = 200, Cost: 2*60 = 120, Margin: 80
    assert data["summary"]["total_revenue"] == "200.00"
    assert data["summary"]["total_cost"] == "120.00"
    assert data["summary"]["gross_margin"] == "80.00"
    assert data["summary"]["margin_percent"] == "40.00"

    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["gross_margin"] == "80.00"
    assert item["margin_percent"] == "40.00"


def test_reportes_con_devolucion_restan_reembolso(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Dashboard, ventas y márgenes reflejan ventas con devoluciones y restan reembolsos."""
    # Venta de 2 unidades ($100 c/u, IVA 16% = $232.00, costo 60 c/u = 120.00)
    create_resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [{"product_id": seed_product_for_sale.id, "quantity": 2}],
            "payments": [{"method": "efectivo", "amount": "232.00"}],
        },
    )
    assert create_resp.status_code == 201
    sale_id = create_resp.get_json()["id"]
    item_id = create_resp.get_json()["items"][0]["id"]

    # Devolución de 1 unidad ($116.00 reembolso total, subtotal $100, costo $60)
    ret_resp = client.post(
        f"/api/sales/{sale_id}/return",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "reason": "Defecto",
            "items": [{"sale_item_id": item_id, "quantity": 1}],
        },
    )
    assert ret_resp.status_code == 200

    # 1. Dashboard: ingreso neto hoy = 116.00 (232 - 116)
    dash_resp = client.get(
        "/api/reports/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert dash_resp.status_code == 200
    dash_data = dash_resp.get_json()
    assert dash_data["revenue_today"] == "116.00"
    top_p = dash_data["top_products"][0]
    assert top_p["quantity"] == "1.000"
    assert top_p["revenue"] == "100.00"

    # 2. Reporte de ventas: ingreso neto = 116.00
    sales_rep = client.get(
        "/api/reports/sales",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert sales_rep.status_code == 200
    assert sales_rep.get_json()["total_revenue"] == "116.00"

    # 3. Margen bruto: ingreso 100, costo 60, margen 40
    margin_rep = client.get(
        "/api/reports/gross-margin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert margin_rep.status_code == 200
    m_data = margin_rep.get_json()
    assert m_data["summary"]["total_revenue"] == "100.00"
    assert m_data["summary"]["total_cost"] == "60.00"
    assert m_data["summary"]["gross_margin"] == "40.00"

