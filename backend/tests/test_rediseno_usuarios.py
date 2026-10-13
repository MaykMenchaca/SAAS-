"""Rediseño 7.1: restablecer contraseña y permisos por rol en GET /api/users/roles."""
from app.models.audit import AuditLog
from app.models.user import User


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _reset(client, token, user_id):
    return client.post(f"/api/users/{user_id}/reset-password", headers=_h(token))


def test_reset_devuelve_contrasena_temporal_una_vez(client, admin_token, seed_cajero, db):
    version_antes = seed_cajero.token_version
    response = _reset(client, admin_token, seed_cajero.id)
    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert len(data["temporary_password"]) >= 12
    assert data["user"]["must_change_password"] is True
    assert "password_hash" not in data["user"]

    db.session.expire_all()
    user = db.session.get(User, seed_cajero.id)
    assert user.must_change_password is True
    assert user.token_version > version_antes
    assert user.check_password(data["temporary_password"])

    # No se vuelve a mostrar: ni en la consulta del usuario
    detalle = client.get(f"/api/users/{seed_cajero.id}", headers=_h(admin_token)).get_json()
    assert "temporary_password" not in detalle


def test_reset_genera_contrasenas_distintas(client, admin_token, seed_cajero):
    a = _reset(client, admin_token, seed_cajero.id).get_json()["temporary_password"]
    b = _reset(client, admin_token, seed_cajero.id).get_json()["temporary_password"]
    assert a != b


def test_reset_requiere_permiso_editar(client, regular_user_token, seed_admin):
    response = _reset(client, regular_user_token, seed_admin.id)
    assert response.status_code == 403


def test_reset_gerente_sin_permiso_editar(client, db, seed_roles, seed_cajero):
    gerente = User(username="ger", full_name="Gerente", role_id=seed_roles["gerente"].id)
    gerente.set_password("gerente123")
    db.session.add(gerente)
    db.session.commit()
    token = client.post("/api/auth/login", json={"username": "ger", "password": "gerente123"}).get_json()["access_token"]
    assert _reset(client, token, seed_cajero.id).status_code == 403


def test_reset_usuario_inexistente(client, admin_token):
    assert _reset(client, admin_token, 99999).status_code == 404


def test_reset_a_uno_mismo_si_es_el_ultimo_admin_se_rechaza(client, admin_token, seed_admin, db):
    response = _reset(client, admin_token, seed_admin.id)
    assert response.status_code == 400
    assert "administrador" in response.get_json()["error"].lower()
    db.session.expire_all()
    assert db.session.get(User, seed_admin.id).check_password("admin123")


def test_reset_a_uno_mismo_permitido_si_hay_otro_admin(client, admin_token, seed_admin, seed_roles, db):
    otro = User(username="admin2", full_name="Otro Admin", role_id=seed_roles["admin"].id)
    otro.set_password("admin2-clave")
    db.session.add(otro)
    db.session.commit()
    assert _reset(client, admin_token, seed_admin.id).status_code == 200


def test_reset_de_usuario_inactivo_se_rechaza(client, admin_token, seed_cajero, db):
    seed_cajero.is_active = False
    db.session.commit()
    assert _reset(client, admin_token, seed_cajero.id).status_code == 400


def test_reset_no_deja_la_contrasena_en_auditoria(client, admin_token, seed_cajero, db):
    temporal = _reset(client, admin_token, seed_cajero.id).get_json()["temporary_password"]
    db.session.expire_all()
    registros = AuditLog.query.filter_by(entity_type="user", entity_id=seed_cajero.id).all()
    acciones = [r.action for r in registros]
    assert "restablecer_contrasena" in acciones
    for r in registros:
        assert temporal not in str(r.details)


def test_reset_invalida_login_viejo_y_exige_cambio(client, admin_token, seed_cajero):
    sesion_vieja = client.post("/api/auth/login", json={"username": "cajero1", "password": "cajero123"}).get_json()["access_token"]
    temporal = _reset(client, admin_token, seed_cajero.id).get_json()["temporary_password"]

    # La contraseña anterior ya no sirve
    assert client.post("/api/auth/login", json={"username": "cajero1", "password": "cajero123"}).status_code == 401
    # La sesión anterior fue revocada
    assert client.get("/api/auth/me", headers=_h(sesion_vieja)).status_code == 401
    # La nueva entra y exige cambio
    nuevo = client.post("/api/auth/login", json={"username": "cajero1", "password": temporal})
    assert nuevo.status_code == 200
    assert nuevo.get_json()["must_change_password"] is True


def test_roles_incluye_permisos_de_cada_rol(client, admin_token, seed_roles):
    roles = {r["name"]: r for r in client.get("/api/users/roles", headers=_h(admin_token)).get_json()}
    cajero = roles["cajero"]
    codigos = {p["code"] for p in cajero["permissions"]}
    assert "ventas:crear" in codigos and "usuarios:crear" not in codigos
    ejemplo = cajero["permissions"][0]
    assert {"code", "module", "description"} <= set(ejemplo)
    assert len(roles["admin"]["permissions"]) > len(cajero["permissions"])


def test_catalogo_de_permisos_para_la_matriz(client, admin_token, seed_permissions):
    response = client.get("/api/users/permissions", headers=_h(admin_token))
    assert response.status_code == 200
    items = response.get_json()
    assert len(items) == len(seed_permissions)
    assert {"code", "module", "description"} <= set(items[0])


def test_catalogo_de_permisos_requiere_permiso(client, db, seed_roles, seed_permissions):
    u = User(username="sinver", full_name="Sin", role_id=seed_roles["cajero"].id)
    u.set_password("sinver1234")
    db.session.add(u)
    db.session.commit()
    token = client.post("/api/auth/login", json={"username": "sinver", "password": "sinver1234"}).get_json()["access_token"]
    assert client.get("/api/users/permissions", headers=_h(token)).status_code == 403
