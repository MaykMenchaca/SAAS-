"""Revisión funcional 2026-10, carril P (Fase 4, hallazgos bajos).

RF-29 (venta inexistente → 404, token inválido → 401), RF-30 (client_uuid ajeno → 409),
RF-31 (el 503 de impresión no expone rutas), RF-43 (branding lee company_*), RF-44 (parámetros de
reportes), RF-45 (change-password con freno), RF-46 (filtro de auditoría inválido), RF-47 (retención de
pre-restore) y los pendientes del Dashboard (conteo de stock bajo y neto sin recortar).
"""
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest

from app.models.inventory import Stock
from app.models.product import Product, UnitOfMeasure
from app.models.sale import CashRegister, CashRegisterSession, Sale
from app.services import backup_service, config_service
from app.services.rate_limiter import change_password_limiter
from app.utils.timeutil import local_today
# Fixture y utilidades del reporte con devoluciones (carril Z, RF-25)
from tests.test_revision_funcional_z import _devolucion, _venta, caja  # noqa: F401


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _limpiar_freno_change_password():
    change_password_limiter.reset()
    yield
    change_password_limiter.reset()


# ── RF-29: recurso inexistente → 404; token inválido → 401 ───────────────────────────────

def test_rf29_cancelar_venta_inexistente_responde_404(client, admin_token):
    resp = client.post("/api/sales/999999/cancel", headers=_h(admin_token), json={"reason": "QA"})
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Venta no encontrada"


@pytest.mark.parametrize("metodo", ["efectivo", "tarjeta"])
def test_rf29_devolver_venta_inexistente_responde_404(client, admin_token, metodo):
    # Sin caja abierta: antes el efectivo respondía 400 por la caja aunque la venta no existiera
    resp = client.post("/api/sales/999999/return", headers=_h(admin_token), json={
        "reason": "QA", "refund_method": metodo, "items": [{"sale_item_id": 1, "quantity": "1"}],
    })
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Venta no encontrada"


@pytest.mark.parametrize("token", ["basura", "a.b.c", "eyJhbGciOiJIUzI1NiJ9.e30.firma-falsa"])
def test_rf29_token_malformado_responde_401(client, seed_admin, token):
    for ruta in ("/api/auth/me", "/api/products/"):
        resp = client.get(ruta, headers=_h(token))
        assert resp.status_code == 401, ruta
        assert resp.get_json()["code"] == "invalid_token"


def test_rf29_tipo_de_token_equivocado_responde_401(client, admin_token, admin_refresh_token):
    assert client.post("/api/auth/refresh", headers=_h(admin_token)).status_code == 401
    assert client.get("/api/auth/me", headers=_h(admin_refresh_token)).status_code == 401


def test_rf29_validacion_de_datos_sigue_en_422(client, admin_token):
    resp = client.post("/api/sales/quote", headers=_h(admin_token), json={})
    assert resp.status_code == 422
    assert resp.get_json()["error"] == "Datos inválidos"


# ── RF-30: el client_uuid de otro usuario no devuelve su venta ───────────────────────────

@pytest.fixture
def sesion_cajero(db, seed_cajero):
    register = CashRegister(name="Caja RF30")
    db.session.add(register)
    db.session.flush()
    session = CashRegisterSession(
        cash_register_id=register.id, user_id=seed_cajero.id,
        opening_amount=Decimal("0.00"), status="abierta",
    )
    db.session.add(session)
    db.session.commit()
    return session


def _venta_uuid(client, token, session, product, client_uuid):
    return client.post("/api/sales/", headers=_h(token), json={
        "session_id": session.id,
        "client_uuid": client_uuid,
        "items": [{"product_id": product.id, "quantity": "1"}],
        "payments": [{"method": "efectivo", "amount": "200.00"}],
    })


def test_rf30_reenvio_de_otro_usuario_responde_409_sin_revelar_la_venta(
    client, admin_token, regular_user_token, sesion_cajero, seed_product_for_sale
):
    cu = str(uuid.uuid4())
    original = _venta_uuid(client, regular_user_token, sesion_cajero, seed_product_for_sale, cu)
    assert original.status_code == 201
    folio = original.get_json()["folio"]

    resp = _venta_uuid(client, admin_token, sesion_cajero, seed_product_for_sale, cu)
    assert resp.status_code == 409
    datos = resp.get_json()
    assert datos["code"] == "client_uuid_conflict"
    assert folio not in resp.get_data(as_text=True)
    assert "id" not in datos and "items" not in datos
    assert Sale.query.filter_by(client_uuid=cu).count() == 1


def test_rf30_reenvio_del_mismo_usuario_conserva_la_idempotencia(
    client, regular_user_token, sesion_cajero, seed_product_for_sale
):
    cu = str(uuid.uuid4())
    primera = _venta_uuid(client, regular_user_token, sesion_cajero, seed_product_for_sale, cu)
    segunda = _venta_uuid(client, regular_user_token, sesion_cajero, seed_product_for_sale, cu)
    assert primera.status_code == 201 and segunda.status_code == 201
    assert segunda.get_json()["id"] == primera.get_json()["id"]
    assert Sale.query.filter_by(client_uuid=cu).count() == 1


def test_rf30_servicio_rechaza_uuid_ajeno(db, seed_admin, seed_cajero, sesion_cajero, seed_product_for_sale):
    from app.services.sale_service import ClientUuidConflictError, SaleService

    cu = str(uuid.uuid4())
    datos = dict(
        session_id=sesion_cajero.id,
        items=[{"product_id": seed_product_for_sale.id, "quantity": 1}],
        payments=[{"method": "efectivo", "amount": "200.00"}],
        client_uuid=cu,
    )
    SaleService.create_sale(user_id=seed_cajero.id, **datos)
    with pytest.raises(ClientUuidConflictError):
        SaleService.create_sale(user_id=seed_admin.id, **datos)


# ── RF-31: el 503 de impresión no expone la ruta del servidor ────────────────────────────

def test_rf31_error_de_impresora_no_expone_la_ruta(
    client, admin_token, db, seed_admin, seed_open_session, seed_product_for_sale, monkeypatch, tmp_path
):
    from app.services.sale_service import SaleService

    sale = SaleService.create_sale(
        user_id=seed_admin.id, session_id=seed_open_session.id,
        items=[{"product_id": seed_product_for_sale.id, "quantity": 1}],
        payments=[{"method": "efectivo", "amount": "200.00"}],
    )
    destino = tmp_path / "carpeta_inexistente_rf31" / "impresora.prn"
    monkeypatch.setenv("PRINTER_DEVICE_PATH", str(destino))

    resp = client.post(f"/api/printing/sales/{sale.id}/ticket", headers=_h(admin_token), json={"send": True})
    assert resp.status_code == 503
    cuerpo = resp.get_data(as_text=True)
    assert "Impresora no disponible" in resp.get_json()["error"]
    assert "carpeta_inexistente_rf31" not in cuerpo
    assert "Errno" not in cuerpo
    assert str(tmp_path.name) not in cuerpo


# ── RF-45: change-password con freno y sin repetir la contraseña ─────────────────────────

def _cambiar(client, token, actual, nueva="NuevaClave2026"):
    return client.post("/api/auth/change-password", headers=_h(token),
                       json={"current_password": actual, "new_password": nueva})


def test_rf45_nueva_igual_a_la_actual_responde_400(client, admin_token):
    resp = _cambiar(client, admin_token, "admin123", "admin123")
    assert resp.status_code == 400
    assert "distinta" in resp.get_json()["error"]


def test_rf45_intentos_fallidos_bloquean_el_cambio(client, admin_token):
    from app.services.rate_limiter import USER_MAX_FAILURES

    for _ in range(USER_MAX_FAILURES):
        assert _cambiar(client, admin_token, "incorrecta").status_code == 400
    bloqueado = _cambiar(client, admin_token, "incorrecta")
    assert bloqueado.status_code == 429
    # Ni con la contraseña correcta mientras dure el bloqueo
    assert _cambiar(client, admin_token, "admin123").status_code == 429
    # El inicio de sesión no comparte este contador
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200


def test_rf45_el_bloqueo_vence(client, admin_token):
    from app.services.rate_limiter import USER_LOCKOUT, USER_MAX_FAILURES

    ahora = [1_000_000.0]
    change_password_limiter.clock = lambda: ahora[0]
    try:
        for _ in range(USER_MAX_FAILURES):
            _cambiar(client, admin_token, "incorrecta")
        assert _cambiar(client, admin_token, "admin123").status_code == 429
        ahora[0] += USER_LOCKOUT + 1
        assert _cambiar(client, admin_token, "admin123").status_code == 200
    finally:
        import time
        change_password_limiter.clock = time.time


def test_rf45_un_cambio_correcto_limpia_los_fallos(client, admin_token):
    from app.services.rate_limiter import USER_MAX_FAILURES

    for _ in range(USER_MAX_FAILURES - 1):
        _cambiar(client, admin_token, "incorrecta")
    resp = _cambiar(client, admin_token, "admin123")
    assert resp.status_code == 200
    nuevo = resp.get_json()["access_token"]
    # El contador quedó en cero: otro fallo no bloquea
    assert _cambiar(client, nuevo, "incorrecta").status_code == 400


# ── RF-46: filtro inválido en auditoría ──────────────────────────────────────────────────

@pytest.mark.parametrize("parametro", ["user_id=abc", "entity_id=abc", "user_id=1.5"])
def test_rf46_filtro_no_numerico_responde_400(client, admin_token, parametro):
    resp = client.get(f"/api/audit/?{parametro}", headers=_h(admin_token))
    assert resp.status_code == 400
    assert parametro.split("=")[0] in resp.get_json()["error"]


def test_rf46_filtro_numerico_sigue_filtrando(client, admin_token, seed_admin):
    resp = client.get(f"/api/audit/?user_id={seed_admin.id}", headers=_h(admin_token))
    assert resp.status_code == 200
    assert all(item["user_id"] == seed_admin.id for item in resp.get_json()["items"])
    vacio = client.get("/api/audit/?user_id=999999", headers=_h(admin_token)).get_json()
    assert vacio["total"] == 0
