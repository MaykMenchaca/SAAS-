"""Tests for sales and cash register API endpoints (Task 19)."""
from decimal import Decimal


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
                }
            ],
            "payments": [
                {"method": "efectivo", "amount": "232.00"},
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
                }
            ],
            "payments": [
                {"method": "efectivo", "amount": "116.00"},
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
                }
            ],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
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


def test_session_summary_returns_payment_breakdown(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Corte de caja summary should break down payments by method."""
    # Create a cash sale
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "120.00", "change_amount": "4.00"}],
        },
    )

    response = client.get(
        f"/api/cash-register/{seed_open_session.id}/summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["sales_completed"] == 1
    assert data["sales_cancelled"] == 0
    assert "efectivo" in data["payment_methods"]
    assert data["grand_total"] == "116.00"


def test_close_session_calculates_expected_cash(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Closing a session should calculate expected cash from opening + cash sales."""
    # Create a cash sale: total = 116.00, paid 120, change 4 → net cash = 116
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "120.00", "change_amount": "4.00"}],
        },
    )

    # Close the session reporting exactly the expected cash (1000 opening + 116 net cash)
    response = client.post(
        f"/api/cash-register/{seed_open_session.id}/close",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"closing_amount": "1116.00"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["expected_cash"] == "1116.00"
    assert data["difference"] == "0.00"


def test_admin_can_return_partial_sale(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Partial return should restore inventory for returned items only."""
    # Create a sale with quantity=5
    create_resp = client.post(
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
    sale_id = create_resp.get_json()["id"]
    item_id = create_resp.get_json()["items"][0]["id"]

    # Return 2 of the 5
    response = client.post(
        f"/api/sales/{sale_id}/return",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "reason": "Producto defectuoso",
            "items": [{"sale_item_id": item_id, "quantity": 2}],
        },
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "devolucion_parcial"
    assert len(data["returned_items"]) == 1
    assert data["returned_items"][0]["quantity"] == "2.000"


def test_return_full_sale(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Full return should mark sale as returned."""
    create_resp = client.post(
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
    sale_id = create_resp.get_json()["id"]
    item_id = create_resp.get_json()["items"][0]["id"]

    response = client.post(
        f"/api/sales/{sale_id}/return",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "reason": "Cliente cambio de opinion",
            "items": [{"sale_item_id": item_id, "quantity": 2}],
        },
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "devolucion_total"


def test_cannot_return_more_than_sold(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """Should not allow returning more than was sold."""
    create_resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
        },
    )
    sale_id = create_resp.get_json()["id"]
    item_id = create_resp.get_json()["items"][0]["id"]

    response = client.post(
        f"/api/sales/{sale_id}/return",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "reason": "Error",
            "items": [{"sale_item_id": item_id, "quantity": 5}],
        },
    )
    assert response.status_code == 400


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
                }
            ],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
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


# --- Regression Tests: Subfase 1.3 (H-16) ---


def test_cajero_no_puede_cerrar_caja_ajena(client, db, seed_roles, seed_cash_register):
    """Un cajero sin permiso caja:supervisar recibe 403 al intentar cerrar la caja de otro usuario."""
    from decimal import Decimal
    from app.models.user import User
    from app.models.sale import CashRegisterSession

    cajero1 = User(username="caj_c1", email="c1@test.com", full_name="Caj 1", role_id=seed_roles["cajero"].id)
    cajero1.set_password("caj123")
    cajero2 = User(username="caj_c2", email="c2@test.com", full_name="Caj 2", role_id=seed_roles["cajero"].id)
    cajero2.set_password("caj123")
    db.session.add_all([cajero1, cajero2])
    db.session.flush()

    session1 = CashRegisterSession(
        cash_register_id=seed_cash_register.id,
        user_id=cajero1.id,
        opening_amount=Decimal("500.00"),
        status="abierta",
    )
    db.session.add(session1)
    db.session.commit()

    login_resp = client.post("/api/auth/login", json={"username": "caj_c2", "password": "caj123"})
    token2 = login_resp.get_json()["access_token"]

    close_resp = client.post(
        f"/api/cash-register/{session1.id}/close",
        headers={"Authorization": f"Bearer {token2}"},
        json={"closing_amount": "500.00"},
    )
    assert close_resp.status_code == 403
    assert "otro usuario" in close_resp.get_json()["error"]


def test_supervisor_o_admin_puede_cerrar_caja_ajena(client, db, seed_roles, seed_cash_register, admin_token):
    """Un admin o usuario con caja:supervisar puede cerrar la sesión de otro cajero."""
    from decimal import Decimal
    from app.models.user import User
    from app.models.sale import CashRegisterSession

    cajero = User(username="caj_c3", email="c3@test.com", full_name="Caj 3", role_id=seed_roles["cajero"].id)
    cajero.set_password("caj123")
    db.session.add(cajero)
    db.session.flush()

    session = CashRegisterSession(
        cash_register_id=seed_cash_register.id,
        user_id=cajero.id,
        opening_amount=Decimal("500.00"),
        status="abierta",
    )
    db.session.add(session)
    db.session.commit()

    close_resp = client.post(
        f"/api/cash-register/{session.id}/close",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"closing_amount": "500.00"},
    )
    assert close_resp.status_code == 200


def test_cajero_no_puede_vender_en_sesion_ajena_api(client, db, seed_roles, seed_cash_register, seed_product_for_sale):
    """Un cajero recibe 403 al intentar registrar una venta en la sesión de otro usuario."""
    from decimal import Decimal
    from app.models.user import User
    from app.models.sale import CashRegisterSession

    cajero1 = User(username="caj_v1", email="v1@test.com", full_name="Cajero V1", role_id=seed_roles["cajero"].id)
    cajero1.set_password("caj123")
    cajero2 = User(username="caj_v2", email="v2@test.com", full_name="Cajero V2", role_id=seed_roles["cajero"].id)
    cajero2.set_password("caj123")
    db.session.add_all([cajero1, cajero2])
    db.session.flush()

    session1 = CashRegisterSession(
        cash_register_id=seed_cash_register.id,
        user_id=cajero1.id,
        opening_amount=Decimal("500.00"),
        status="abierta",
    )
    db.session.add(session1)
    db.session.commit()

    login_resp = client.post("/api/auth/login", json={"username": "caj_v2", "password": "caj123"})
    token2 = login_resp.get_json()["access_token"]

    resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {token2}"},
        json={
            "session_id": session1.id,
            "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
        },
    )
    assert resp.status_code == 403
    assert "otro usuario" in resp.get_json()["error"]


def test_sobrepago_tarjeta_rechazado_api(client, admin_token, seed_open_session, seed_product_for_sale):
    """Sobrepago con tarjeta o transferencia en el endpoint POST /api/sales/ devuelve 400."""
    resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
            "payments": [{"method": "tarjeta", "amount": "150.00"}],
        },
    )
    assert resp.status_code == 400
    assert "sobrepago" in resp.get_json()["error"].lower()


# --- Regression Tests: Subfase 1.5.3 (H-08) ---


def test_api_return_with_session_and_refund_method(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """POST /api/sales/<id>/return registra session_id y refund_method."""
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

    return_resp = client.post(
        f"/api/sales/{sale_id}/return",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "reason": "Garantía",
            "session_id": seed_open_session.id,
            "refund_method": "tarjeta",
            "items": [{"sale_item_id": item_id, "quantity": 1}],
        },
    )
    assert return_resp.status_code == 200
    data = return_resp.get_json()
    assert data["session_id"] == seed_open_session.id
    assert data["refund_method"] == "tarjeta"


# --- Regression Tests: Subfase 1.5.4 (H-25) ---


def test_api_sale_detail_includes_fractions_and_available_quantity(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """GET /api/sales/<id> expone allows_fractions, returned_quantity y available_quantity."""
    create_resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [{"product_id": seed_product_for_sale.id, "quantity": 3}],
            "payments": [{"method": "efectivo", "amount": "348.00"}],
        },
    )
    assert create_resp.status_code == 201
    sale_id = create_resp.get_json()["id"]
    item_id = create_resp.get_json()["items"][0]["id"]

    # Consulta inicial de detalle
    detail_resp = client.get(
        f"/api/sales/{sale_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert detail_resp.status_code == 200
    item = detail_resp.get_json()["items"][0]
    assert item["allows_fractions"] is False
    assert Decimal(item["returned_quantity"]) == Decimal("0")
    assert Decimal(item["available_quantity"]) == Decimal("3")

    # Realizar devolución parcial de 1 unidad
    ret_resp = client.post(
        f"/api/sales/{sale_id}/return",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "reason": "Parcial",
            "items": [{"sale_item_id": item_id, "quantity": 1}],
        },
    )
    assert ret_resp.status_code == 200

    # Nueva consulta de detalle debe reflejar 1 devuelto y 2 disponibles
    detail_resp2 = client.get(
        f"/api/sales/{sale_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert detail_resp2.status_code == 200
    item2 = detail_resp2.get_json()["items"][0]
    assert Decimal(item2["returned_quantity"]) == Decimal("1")
    assert Decimal(item2["available_quantity"]) == Decimal("2")


# --- Regression Tests: Subfase 1.6 (H-08) ---


def test_corte_caja_con_devolucion_sobrante_cero(
    client, admin_token, seed_open_session, seed_product_for_sale
):
    """El corte de caja y /summary calculan expected_cash restando reembolsos en efectivo (QA-08: sobrante $0)."""
    # Venta de 2 unidades por $232.00 efectivo
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

    # Devolución de 1 unidad ($116.00 reembolso en efectivo desde esta sesión)
    ret_resp = client.post(
        f"/api/sales/{sale_id}/return",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "reason": "Devolución en caja",
            "session_id": seed_open_session.id,
            "refund_method": "efectivo",
            "items": [{"sale_item_id": item_id, "quantity": 1}],
        },
    )
    assert ret_resp.status_code == 200

    # /summary debe reflejar venta en devolucion_parcial y neto de $116.00
    summary_resp = client.get(
        f"/api/cash-register/{seed_open_session.id}/summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert summary_resp.status_code == 200
    summary = summary_resp.get_json()
    assert summary["grand_total"] == "116.00"
    assert summary["payment_methods"]["efectivo"] == "116.00"

    # En el cajón hay: 1000 (fondo) + 232 (venta) - 116 (reembolso) = 1116.00
    close_resp = client.post(
        f"/api/cash-register/{seed_open_session.id}/close",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"closing_amount": "1116.00"},
    )
    assert close_resp.status_code == 200
    close_data = close_resp.get_json()
    assert close_data["expected_cash"] == "1116.00"
    assert close_data["difference"] == "0.00"




