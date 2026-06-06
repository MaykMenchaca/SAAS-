def test_admin_can_create_user(client, admin_token, seed_roles):
    response = client.post(
        "/api/users/",
        json={
            "username": "nuevo",
            "email": "nuevo@test.com",
            "full_name": "Nuevo Usuario",
            "password": "secure123",
            "role_id": seed_roles["cajero"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["username"] == "nuevo"
    assert data["email"] == "nuevo@test.com"
    assert data["role"] == "cajero"
    assert data["is_active"] is True
    assert "password_hash" not in data


def test_create_user_requires_permission(client, regular_user_token, seed_roles):
    response = client.post(
        "/api/users/",
        json={
            "username": "bloqueado",
            "email": "bloqueado@test.com",
            "full_name": "Usuario Bloqueado",
            "password": "secure123",
            "role_id": seed_roles["cajero"].id,
        },
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )

    assert response.status_code == 403


def test_admin_can_list_users(client, admin_token, seed_admin):
    response = client.get(
        "/api/users/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == "admin"


def test_admin_can_update_user(client, admin_token, seed_cajero, seed_roles):
    response = client.patch(
        f"/api/users/{seed_cajero.id}",
        json={
            "full_name": "Cajero Editado",
            "role_id": seed_roles["gerente"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["full_name"] == "Cajero Editado"
    assert data["role"] == "gerente"


def test_admin_can_deactivate_user(client, admin_token, seed_cajero):
    response = client.delete(
        f"/api/users/{seed_cajero.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["is_active"] is False


def test_create_user_validates_password_length(client, admin_token, seed_roles):
    response = client.post(
        "/api/users/",
        json={
            "username": "shortpass",
            "email": "shortpass@test.com",
            "full_name": "Short Password",
            "password": "short",
            "role_id": seed_roles["cajero"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422
