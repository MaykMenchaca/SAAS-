def test_create_user(db):
    from app.models.user import User, Role

    role = Role(name="admin", description="Administrador")
    db.session.add(role)
    db.session.flush()

    user = User(
        username="admin",
        email="admin@test.com",
        full_name="Admin User",
        role_id=role.id,
    )
    user.set_password("securepass123")
    db.session.add(user)
    db.session.commit()

    assert user.id is not None
    assert user.check_password("securepass123")
    assert not user.check_password("wrongpass")
    assert user.role_name == "admin"


def test_user_permissions(db):
    from app.models.user import User, Role, Permission

    perm1 = Permission(code="productos:crear", module="productos", description="Crear productos")
    perm2 = Permission(code="productos:editar", module="productos", description="Editar productos")
    db.session.add_all([perm1, perm2])
    db.session.flush()

    role = Role(name="gerente", description="Gerente")
    role.permissions.extend([perm1, perm2])
    db.session.add(role)
    db.session.flush()

    user = User(
        username="gerente1",
        email="gerente1@test.com",
        full_name="Gerente Test",
        role_id=role.id,
    )
    user.set_password("pass123")
    db.session.add(user)
    db.session.commit()

    assert "productos:crear" in user.permissions
    assert "productos:editar" in user.permissions
    assert len(user.permissions) == 2


def test_user_inactive_cannot_be_found(db):
    from app.models.user import User, Role

    role = Role(name="cajero", description="Cajero")
    db.session.add(role)
    db.session.flush()

    user = User(
        username="inactive_user",
        email="inactive@test.com",
        full_name="Inactive User",
        role_id=role.id,
        is_active=False,
    )
    user.set_password("pass123")
    db.session.add(user)
    db.session.commit()

    found = User.query.filter_by(username="inactive_user", is_active=True).first()
    assert found is None


# --- API Tests ---

def test_login_success(client, seed_admin):
    response = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert response.status_code == 200
    data = response.get_json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"


def test_login_wrong_password(client, seed_admin):
    response = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "wrong",
    })
    assert response.status_code == 401


def test_login_inactive_user(client, db, seed_roles):
    from app.models.user import User
    user = User(
        username="disabled",
        email="disabled@test.com",
        full_name="Disabled User",
        role_id=seed_roles["cajero"].id,
        is_active=False,
    )
    user.set_password("pass123")
    db.session.add(user)
    db.session.flush()

    response = client.post("/api/auth/login", json={
        "username": "disabled",
        "password": "pass123",
    })
    assert response.status_code == 401


def test_me_endpoint(client, admin_token):
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["username"] == "admin"


def test_me_without_token(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_refresh_token(client, admin_refresh_token):
    response = client.post(
        "/api/auth/refresh",
        headers={"Authorization": f"Bearer {admin_refresh_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert "access_token" in data


def test_logout(client, admin_token):
    response = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
