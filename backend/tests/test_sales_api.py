"""Tests for sales and cash register API endpoints (Task 19)."""


# --- Cash Register Session endpoints ---


def test_admin_can_open_cash_register(client, admin_token, seed_cash_register):
    response = client.post(
        "/api/cash-register/open",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "cash_register_id": seed_cash_register.id,
            "opening_amount": "1500.00",
        },
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["status"] == "abierta"
    assert data["opening_amount"] == "1500.00"
    assert data["cash_register_name"] == "Caja 1"


def test_open_session_requires_permission(client, db, seed_cash_register):
    """Unauthenticated request should fail."""
    response = client.post(
        "/api/cash-register/open",
        json={"cash_register_id": seed_cash_register.id, "opening_amount": "500.00"},
    )
    assert response.status_code == 401


def test_admin_can_close_cash_register(client, admin_token, seed_open_session):
    response = client.post(
        f"/api/cash-register/{seed_open_session.id}/close",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"closing_amount": "1200.00", "close_notes": "Todo bien"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "cerrada"
    assert data["closing_amount"] == "1200.00"


def test_close_already_closed_session(client, admin_token, seed_open_session):
    # Close it first
    client.post(
        f"/api/cash-register/{seed_open_session.id}/close",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"closing_amount": "1000.00"},
    )
    # Try closing again
    response = client.post(
        f"/api/cash-register/{seed_open_session.id}/close",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"closing_amount": "1000.00"},
    )
    assert response.status_code == 400


def test_admin_can_list_sessions(client, admin_token, seed_open_session):
    response = client.get(
        "/api/cash-register/sessions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) >= 1
    assert data[0]["status"] == "abierta"


# --- Sale endpoints ---


def test_admin_can_create_sale(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    response = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 2,
                    "unit_price": "149.90",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [
                {"method": "efectivo", "amount": "347.77"},
            ],
        },
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["folio"].startswith("V-")
    assert data["status"] == "completada"
    assert len(data["items"]) == 1
    assert len(data["payments"]) == 1


def test_create_sale_requires_permission(client, db):
    response = client.post("/api/sales/", json={})
    assert response.status_code == 401


def test_admin_can_cancel_sale(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    # Create a sale first
    create_resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "149.90",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [
                {"method": "efectivo", "amount": "173.88"},
            ],
        },
    )
    sale_id = create_resp.get_json()["id"]

    # Cancel it
    response = client.post(
        f"/api/sales/{sale_id}/cancel",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Error de captura"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "cancelada"
    assert data["cancel_reason"] == "Error de captura"


def test_admin_can_list_sales(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    # Create a sale
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "149.90",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "173.88"}],
        },
    )

    response = client.get(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert "items" in data
    assert len(data["items"]) >= 1


def test_admin_can_get_sale_detail(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    create_resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "149.90",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "173.88"}],
        },
    )
    sale_id = create_resp.get_json()["id"]

    response = client.get(
        f"/api/sales/{sale_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["id"] == sale_id
    assert "items" in data
    assert "payments" in data
