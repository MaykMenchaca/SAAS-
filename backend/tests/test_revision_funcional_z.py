"""Revisión funcional 2026-10, carril Z (Fase 3): autenticación (RF-24, RF-28, RF-41, RF-42, RF-12)
y reporte de ventas con devoluciones (RF-25)."""
from datetime import timedelta
from decimal import Decimal

import pytest

from app.models.sale import CashRegister, CashRegisterSession, Payment, Sale, SaleReturn
from app.models.user import User
from app.services.rate_limiter import login_limiter
from app.utils.timeutil import local_day_bounds, local_today


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, username, password, ip="10.0.0.1"):
    return client.post(
        "/api/auth/login",
        environ_overrides={"REMOTE_ADDR": ip},
        json={"username": username, "password": password},
    )


# ---------------------------------------------------------------- RF-24 ---


def test_rf24_change_password_entrega_refresh_nuevo(client, seed_admin):
    sesion = _login(client, "admin", "admin123").get_json()
    resp = client.post(
        "/api/auth/change-password",
        headers=_h(sesion["access_token"]),
        json={"current_password": "admin123", "new_password": "nueva-clave-1"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["access_token"] and body["refresh_token"]

    # El refresh nuevo sigue sirviendo; el de antes del cambio quedó revocado
    nuevo = client.post("/api/auth/refresh", headers=_h(body["refresh_token"]))
    assert nuevo.status_code == 200 and nuevo.get_json()["access_token"]
    viejo = client.post("/api/auth/refresh", headers=_h(sesion["refresh_token"]))
    assert viejo.status_code == 401


# ---------------------------------------------------------------- RF-12 ---


@pytest.mark.parametrize("payload", [
    {"username": "admin", "password": 12345678},
    {"username": 123, "password": "admin123"},
    {"username": ["admin"], "password": "admin123"},
    {"username": "admin", "password": {"a": 1}},
])
def test_rf12_login_con_tipos_no_texto_da_400(client, seed_admin, payload):
    resp = client.post("/api/auth/login", json=payload)
    assert resp.status_code == 400
    assert "error" in resp.get_json()


def test_rf12_login_con_cuerpo_lista_da_400(client, seed_admin):
    assert client.post("/api/auth/login", json=["admin", "admin123"]).status_code == 400


@pytest.mark.parametrize("payload", [
    {"current_password": "admin123", "new_password": 123456789},
    {"current_password": 12345678, "new_password": "nueva-clave-1"},
    {"current_password": ["admin123"], "new_password": "nueva-clave-1"},
])
def test_rf12_change_password_con_tipos_no_texto_da_400(client, admin_token, payload):
    resp = client.post("/api/auth/change-password", headers=_h(admin_token), json=payload)
    assert resp.status_code == 400
    assert "error" in resp.get_json()


# ---------------------------------------------------------------- RF-41 ---


def test_rf41_logins_correctos_no_consumen_el_limite_por_ip(client, seed_admin):
    for _ in range(8):
        assert _login(client, "admin", "admin123", ip="10.1.1.1").status_code == 200


def test_rf41_los_fallos_si_cuentan_para_el_limite_por_ip(client, seed_admin):
    for _ in range(5):
        assert _login(client, "admin", "mala", ip="10.1.1.2").status_code == 401
    # Tras 5 fallos en un minuto, la IP espera aunque ahora traiga la contraseña correcta
    assert _login(client, "admin", "admin123", ip="10.1.1.2").status_code == 429
    # Otra IP no se ve afectada
    assert _login(client, "admin", "admin123", ip="10.1.1.3").status_code == 200


# ---------------------------------------------------------------- RF-28 ---


@pytest.fixture
def reloj(monkeypatch):
    """Reloj controlable del limitador para simular el paso del tiempo sin esperar."""
    actual = [1_000_000.0]
    monkeypatch.setattr(login_limiter, "clock", lambda: actual[0])
    return actual


def _fallar(client, reloj, username, ip, veces):
    # Un fallo cada 13 s: no llega al límite por IP (5/min) pero sí acumula fallos de usuario
    for _ in range(veces):
        reloj[0] += 13
        assert _login(client, username, "mala", ip=ip).status_code == 401


def test_rf28_variante_en_mayusculas_entra_y_comparte_la_regla(client, seed_admin):
    # La búsqueda y la llave del bloqueo usan la misma regla (sin distinguir mayúsculas)
    resp = _login(client, "ADMIN", "admin123")
    assert resp.status_code == 200
    assert resp.get_json()["user"]["username"] == "admin"


def test_rf28_usuario_inexistente_no_bloquea_ni_cuenta(client, seed_admin, reloj):
    _fallar(client, reloj, "noexiste", "10.2.0.1", 12)
    assert login_limiter.user_failures == {}
    assert login_limiter.user_lockouts == {}


def test_rf28_atacante_no_deja_fuera_al_admin_desde_otra_ip(client, seed_admin, reloj):
    # 10 fallos con una variante en mayúsculas desde la IP del atacante
    _fallar(client, reloj, "ADMIN", "10.2.0.66", 10)
    # El atacante queda bloqueado para ese usuario...
    reloj[0] += 13
    bloqueado = _login(client, "admin", "admin123", ip="10.2.0.66")
    assert bloqueado.status_code == 429
    assert "bloqueado" in bloqueado.get_json()["error"]
    # ...pero el administrador entra desde su caja
    assert _login(client, "admin", "admin123", ip="10.2.0.10").status_code == 200


def test_rf28_ataque_desde_muchas_ips_no_bloquea_la_cuenta(client, seed_admin, reloj):
    for i in range(20):
        reloj[0] += 1
        assert _login(client, "Admin", "mala", ip=f"10.3.0.{i + 1}").status_code == 401
    assert _login(client, "admin", "admin123", ip="10.3.1.1").status_code == 200


def test_rf28_el_bloqueo_por_usuario_e_ip_expira(client, seed_admin, reloj):
    _fallar(client, reloj, "admin", "10.4.0.1", 10)
    reloj[0] += 13
    assert _login(client, "admin", "admin123", ip="10.4.0.1").status_code == 429
    reloj[0] += 301
    assert _login(client, "admin", "admin123", ip="10.4.0.1").status_code == 200


def test_rf28_duplicado_heredado_por_mayusculas_entra_por_coincidencia_exacta(client, db, seed_roles):
    # Datos anteriores a RF-42: dos usuarios que solo difieren en mayúsculas
    for nombre, clave in (("pepe", "clave-pepe"), ("PEPE", "clave-PEPE")):
        u = User(username=nombre, full_name=nombre, role_id=seed_roles["cajero"].id)
        u.set_password(clave)
        db.session.add(u)
    db.session.commit()
    assert _login(client, "pepe", "clave-pepe").get_json()["user"]["username"] == "pepe"
    assert _login(client, "PEPE", "clave-PEPE").get_json()["user"]["username"] == "PEPE"
    # Una tercera variante es ambigua: no entra como ninguno
    assert _login(client, "Pepe", "clave-pepe").status_code == 401


# ---------------------------------------------------------------- RF-42 ---


def _crear(client, token, **campos):
    datos = {"full_name": "Usuario QA", "password": "secreta123", **campos}
    return client.post("/api/users/", headers=_h(token), json=datos)


def test_rf42_username_con_espacios_se_recorta_y_puede_entrar(client, admin_token, seed_roles):
    resp = _crear(client, admin_token, username="  qa_esp  ", role_id=seed_roles["cajero"].id)
    assert resp.status_code == 201
    assert resp.get_json()["username"] == "qa_esp"
    assert _login(client, " qa_esp ", "secreta123").status_code == 200


def test_rf42_username_duplicado_por_mayusculas_se_rechaza(client, admin_token, seed_roles):
    rol = seed_roles["cajero"].id
    assert _crear(client, admin_token, username="qa_auth", role_id=rol).status_code == 201
    resp = _crear(client, admin_token, username="QA_AUTH", role_id=rol)
    assert resp.status_code == 422
    assert "username" in resp.get_json()["details"]


def test_rf42_email_duplicado_por_mayusculas_se_rechaza(client, admin_token, seed_roles):
    rol = seed_roles["cajero"].id
    assert _crear(client, admin_token, username="qa_c1", email="qa_c@example.com", role_id=rol).status_code == 201
    resp = _crear(client, admin_token, username="qa_c2", email="QA_C@EXAMPLE.COM", role_id=rol)
    assert resp.status_code == 422
    assert "email" in resp.get_json()["details"]
    # El email también se recorta antes de validar
    resp = _crear(client, admin_token, username="qa_c3", email="  qa_d@example.com ", role_id=rol)
    assert resp.status_code == 201 and resp.get_json()["email"] == "qa_d@example.com"


def test_rf42_editar_aplica_recorte_y_unicidad_sin_mayusculas(client, admin_token, seed_roles):
    rol = seed_roles["cajero"].id
    uno = _crear(client, admin_token, username="uno", email="uno@example.com", role_id=rol).get_json()
    dos = _crear(client, admin_token, username="dos", role_id=rol).get_json()
    assert client.patch(f"/api/users/{dos['id']}", headers=_h(admin_token), json={"username": "UNO"}).status_code == 422
    assert client.patch(f"/api/users/{dos['id']}", headers=_h(admin_token), json={"email": "Uno@Example.com"}).status_code == 422
    resp = client.patch(f"/api/users/{dos['id']}", headers=_h(admin_token), json={"username": "  tres "})
    assert resp.status_code == 200 and resp.get_json()["username"] == "tres"
    # Cambiar solo las mayúsculas del propio usuario no choca consigo mismo
    resp = client.patch(f"/api/users/{uno['id']}", headers=_h(admin_token), json={"username": "Uno"})
    assert resp.status_code == 200 and resp.get_json()["username"] == "Uno"


def test_rf42_username_solo_espacios_se_rechaza(client, admin_token, seed_roles):
    resp = _crear(client, admin_token, username="     ", role_id=seed_roles["cajero"].id)
    assert resp.status_code == 422


# ---------------------------------------------------------------- RF-25 ---


@pytest.fixture
def caja(db, seed_admin):
    register = CashRegister(name="Caja RF25")
    db.session.add(register)
    db.session.flush()
    session = CashRegisterSession(
        cash_register_id=register.id, user_id=seed_admin.id,
        opening_amount=Decimal("0.00"), status="abierta",
    )
    db.session.add(session)
    db.session.commit()
    return session


def _mediodia(day):
    return local_day_bounds(day)[0] + timedelta(hours=12)


_folio = [0]


def _venta(db, caja, day, total, method, status="completada"):
    _folio[0] += 1
    total = Decimal(total)
    sale = Sale(
        folio=f"RF25-{_folio[0]}", session_id=caja.id, user_id=caja.user_id,
        subtotal=total, tax_total=Decimal("0.00"), total=total, status=status,
        created_at=_mediodia(day),
    )
    sale.payments.append(Payment(method=method, amount=total))
    db.session.add(sale)
    db.session.commit()
    return sale


def _devolucion(db, caja, sale, day, total, method):
    db.session.add(SaleReturn(
        sale_id=sale.id, user_id=caja.user_id, reason="QA", session_id=caja.id,
        refund_method=method, refund_total=Decimal(total), created_at=_mediodia(day),
    ))
    db.session.commit()


def _reporte(client, token, desde, hasta):
    resp = client.get(f"/api/reports/sales?from={desde.isoformat()}&to={hasta.isoformat()}", headers=_h(token))
    assert resp.status_code == 200
    return resp.get_json()


def _cuadra(data):
    total = Decimal(data["total_revenue"])
    assert sum((Decimal(d["revenue"]) for d in data["daily"]), Decimal("0")) == total
    assert sum((Decimal(m["net_amount"]) for m in data["payment_methods"]), Decimal("0")) == total
    return total


def test_rf25_reembolso_a_tarjeta_de_venta_de_otro_dia_resta_en_tarjeta(client, db, admin_token, caja):
    hoy = local_today()
    ayer = hoy - timedelta(days=1)
    venta_ayer = _venta(db, caja, ayer, "100.00", "tarjeta")
    _venta(db, caja, hoy, "282.00", "efectivo")
    _devolucion(db, caja, venta_ayer, hoy, "100.00", "tarjeta")

    data = _reporte(client, admin_token, hoy, hoy)
    assert _cuadra(data) == Decimal("182.00")
    metodos = {m["method"]: m for m in data["payment_methods"]}
    assert metodos["tarjeta"]["net_amount"] == "-100.00"
    assert metodos["tarjeta"]["count"] == 0
    assert metodos["efectivo"]["net_amount"] == "282.00"


def test_rf25_dia_solo_con_devoluciones_aparece_y_no_se_recorta(client, db, admin_token, caja):
    hoy = local_today()
    d3 = hoy - timedelta(days=3)
    d5 = hoy - timedelta(days=5)
    venta_vieja = _venta(db, caja, d5, "116.00", "efectivo")
    _venta(db, caja, hoy, "470.60", "efectivo")
    _devolucion(db, caja, venta_vieja, d3, "116.00", "efectivo")

    data = _reporte(client, admin_token, d3, hoy)
    assert _cuadra(data) == Decimal("354.60")
    dias = {d["date"]: d for d in data["daily"]}
    assert dias[d3.isoformat()] == {"date": d3.isoformat(), "count": 0, "revenue": "-116.00"}
    assert [d["date"] for d in data["daily"]] == sorted(dias)

    # Solo el día D-3: la salida de efectivo se ve y el total es negativo
    solo = _reporte(client, admin_token, d3, d3)
    assert _cuadra(solo) == Decimal("-116.00")
    assert solo["total_sales"] == 0
    assert solo["payment_methods"] == [{"method": "efectivo", "count": 0, "net_amount": "-116.00"}]


def test_rf25_canceladas_no_cuentan_y_pagos_mixtos_cuadran(client, db, admin_token, caja):
    hoy = local_today()
    _venta(db, caja, hoy, "50.00", "efectivo", status="cancelada")
    mixta = _venta(db, caja, hoy, "300.00", "efectivo")
    mixta.payments[0].amount = Decimal("200.00")
    mixta.payments.append(Payment(method="transferencia", amount=Decimal("100.00")))
    db.session.commit()
    _devolucion(db, caja, mixta, hoy, "40.00", "transferencia")

    data = _reporte(client, admin_token, hoy, hoy)
    assert _cuadra(data) == Decimal("260.00")
    assert data["cancelled_sales"] == 1
