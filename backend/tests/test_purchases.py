"""Tests for supplier CRUD and purchase order endpoints."""


# --- Supplier endpoints ---


def test_admin_can_create_supplier(client, admin_token):
    response = client.post(
        "/api/purchases/suppliers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Ferretera del Norte",
            "rfc": "FDN010101ABC",
            "contact_name": "Juan Perez",
            "phone": "8181234567",
            "email": "ventas@ferrenorte.com",
            "payment_terms": "30 dias",
        },
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "Ferretera del Norte"
    assert data["rfc"] == "FDN010101ABC"
    assert data["is_active"] is True


def test_create_supplier_requires_permission(client, db):
    response = client.post("/api/purchases/suppliers", json={})
    assert response.status_code == 401


def test_admin_can_list_suppliers(client, admin_token):
    # Create a supplier first
    client.post(
        "/api/purchases/suppliers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Proveedor Test", "rfc": "PT010101ABC"},
    )

    response = client.get(
        "/api/purchases/suppliers",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) >= 1


def test_admin_can_update_supplier(client, admin_token):
    create_resp = client.post(
        "/api/purchases/suppliers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Original", "rfc": "ORI010101ABC"},
    )
    supplier_id = create_resp.get_json()["id"]

    response = client.patch(
        f"/api/purchases/suppliers/{supplier_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Actualizado", "phone": "5551234567"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["name"] == "Actualizado"
    assert data["phone"] == "5551234567"


def test_admin_can_deactivate_supplier(client, admin_token):
    create_resp = client.post(
        "/api/purchases/suppliers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Para Desactivar", "rfc": "PD010101ABC"},
    )
    supplier_id = create_resp.get_json()["id"]

    response = client.delete(
        f"/api/purchases/suppliers/{supplier_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["is_active"] is False
