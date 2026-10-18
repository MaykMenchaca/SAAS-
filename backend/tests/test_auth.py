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


def test_seed_no_recrea_admin_si_hay_usuarios(db, seed_admin):
    from app.models.user import User
    from app.seed import seed_admin_user

    initial_count = User.query.count()
    assert initial_count >= 1

    seed_admin_user()
    assert User.query.count() == initial_count


def test_must_change_password_bloquea(client, db, seed_roles):
    from app.models.user import User

    user = User(
        username="temp_user",
        email="temp@test.com",
        full_name="Temp User",
        role_id=seed_roles["admin"].id,
        must_change_password=True,
    )
    user.set_password("initial_pass_123")
    db.session.add(user)
    db.session.commit()

    login_res = client.post("/api/auth/login", json={
        "username": "temp_user",
        "password": "initial_pass_123",
    })
    assert login_res.status_code == 200
    login_data = login_res.get_json()
    assert login_data.get("must_change_password") is True
    token = login_data["access_token"]

    # Endpoint protegido debe bloquear con 403 password_change_required
    users_res = client.get("/api/users/", headers={"Authorization": f"Bearer {token}"})
    assert users_res.status_code == 403
    assert users_res.get_json().get("code") == "password_change_required"

    # Cambiar contrasena
    change_res = client.post(
        "/api/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": "initial_pass_123",
            "new_password": "new_secure_pass_456",
        },
    )
    assert change_res.status_code == 200
    new_token = change_res.get_json()["access_token"]

    # Con el nuevo token, el acceso ya no se bloquea
    users_res_after = client.get("/api/users/", headers={"Authorization": f"Bearer {new_token}"})
    assert users_res_after.status_code == 200


def test_login_rate_limit(client):
    from app.services.rate_limiter import login_limiter
    login_limiter.reset()

    # Los primeros 5 intentos no deben ser bloqueados con 429
    for i in range(5):
        res = client.post("/api/auth/login", json={
            "username": f"user_attempt_{i}",
            "password": "wrong_password",
        })
        assert res.status_code != 429

    # El 6.º intento da 429 Too Many Requests
    res6 = client.post("/api/auth/login", json={
        "username": "user_attempt_6",
        "password": "wrong_password",
    })
    assert res6.status_code == 429



def test_login_user_lockout_tras_10_fallos(client, seed_admin, monkeypatch):
    from app.services.rate_limiter import login_limiter
    login_limiter.reset()
    # El bloqueo es por usuario existente + IP (RF-28); los fallos se espacian para no tocar el
    # límite por IP (5 por minuto)
    reloj = [1_000_000.0]
    monkeypatch.setattr(login_limiter, "clock", lambda: reloj[0])

    for _ in range(10):
        reloj[0] += 13
        res = client.post(
            "/api/auth/login",
            environ_overrides={"REMOTE_ADDR": "10.0.0.1"},
            json={"username": "admin", "password": "wrong"},
        )
        assert res.status_code == 401

    reloj[0] += 13
    res11 = client.post(
        "/api/auth/login",
        environ_overrides={"REMOTE_ADDR": "10.0.0.1"},
        json={"username": "admin", "password": "admin123"},
    )
    assert res11.status_code == 429
    assert "bloqueado" in res11.get_json()["error"]


class TestTokenRevocationAndBlocklist:
    """H-17: Revocación de tokens vía blocklist y token_version."""

    def test_token_revoked_after_logout(self, client, seed_admin):
        """H-17: El token debe quedar invalidado inmediatamente tras el logout."""
        login_res = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123",
        })
        assert login_res.status_code == 200
        token = login_res.get_json()["access_token"]

        # Funciona antes del logout
        res_before = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_before.status_code == 200

        # Logout
        logout_res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert logout_res.status_code == 200

        # Ya NO funciona después del logout
        res_after = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_after.status_code == 401

    def test_token_revoked_when_user_deactivated(self, client, db, seed_roles):
        """H-17: Desactivar a un usuario debe revocar de inmediato sus tokens."""
        from app.models.user import User
        from app.services.user_service import UserService

        user = User(
            username="user_to_disable",
            email="disable@example.com",
            full_name="User To Disable",
            role_id=seed_roles["cajero"].id,
        )
        user.set_password("pass123")
        db.session.add(user)
        db.session.commit()

        login_res = client.post("/api/auth/login", json={
            "username": "user_to_disable",
            "password": "pass123",
        })
        token = login_res.get_json()["access_token"]

        # El token sirve
        res_ok = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_ok.status_code == 200

        # Se desactiva al usuario
        user = db.session.get(User, user.id)  # el cliente aislado (6.1) cierra la sesión del test: se relee el objeto antes de modificarlo
        UserService.deactivate_user(user)

        # El token anterior debe ser rechazado inmediatamente con 401
        res_revoked = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_revoked.status_code == 401

    def test_token_revoked_when_password_changed(self, client, db, seed_roles):
        """H-17: Cambiar la contraseña debe revocar el token anterior."""
        from app.models.user import User

        user = User(
            username="user_pwd_change",
            email="pwdchange@example.com",
            full_name="User Pwd",
            role_id=seed_roles["cajero"].id,
        )
        user.set_password("old_pass_123")
        db.session.add(user)
        db.session.commit()

        login_res = client.post("/api/auth/login", json={
            "username": "user_pwd_change",
            "password": "old_pass_123",
        })
        old_token = login_res.get_json()["access_token"]

        # Cambiar contraseña
        change_res = client.post(
            "/api/auth/change-password",
            headers={"Authorization": f"Bearer {old_token}"},
            json={
                "current_password": "old_pass_123",
                "new_password": "new_pass_45678",
            },
        )
        assert change_res.status_code == 200
        new_token = change_res.get_json()["access_token"]

        # El token viejo ya NO sirve
        res_old = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
        assert res_old.status_code == 401

        # El nuevo token sí sirve
        res_new = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert res_new.status_code == 200

    def test_token_revoked_when_role_changed(self, client, db, seed_roles):
        """H-17: Al cambiar el rol de un usuario, se incrementa token_version y se revoca el token viejo."""
        from app.models.user import User
        from app.services.user_service import UserService

        user = User(
            username="user_role_change",
            email="rolechange@example.com",
            full_name="User Role",
            role_id=seed_roles["cajero"].id,
        )
        user.set_password("pass123")
        db.session.add(user)
        db.session.commit()

        login_res = client.post("/api/auth/login", json={
            "username": "user_role_change",
            "password": "pass123",
        })
        old_token = login_res.get_json()["access_token"]

        # Cambiar rol a admin
        user = db.session.get(User, user.id)  # el cliente aislado (6.1) cierra la sesión del test: se relee el objeto antes de modificarlo
        UserService.update_user(user, {"role_id": seed_roles["admin"].id})

        # Token anterior revocado
        res_old = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
        assert res_old.status_code == 401

    def test_refresh_token_revoked_on_logout(self, client, seed_admin):
        """H-17: El refresh token enviado en logout también queda revocado."""
        login_res = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123",
        })
        access_token = login_res.get_json()["access_token"]
        refresh_token = login_res.get_json()["refresh_token"]

        # Logout revocando el refresh token
        logout_res = client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"refresh_token": refresh_token},
        )
        assert logout_res.status_code == 200

        # Intentar refrescar con el token revocado debe fallar con 401
        refresh_res = client.post(
            "/api/auth/refresh",
            headers={"Authorization": f"Bearer {refresh_token}"},
        )
        assert refresh_res.status_code == 401




