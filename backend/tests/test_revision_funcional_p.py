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


# ── RF-43: branding usa las claves company_* de Configuración ────────────────────────────

def test_rf43_branding_lee_las_claves_company(client, db):
    for clave, valor in {
        "company_name": "Ferretería Central",
        "company_address": "Av. Juárez 10",
        "company_phone": "555-0101",
        "company_rfc": "FCE010101AB1",
    }.items():
        config_service.set_value(clave, valor)
    db.session.commit()

    datos = client.get("/api/config/branding").get_json()
    assert datos["business_name"] == datos["company_name"] == "Ferretería Central"
    assert datos["business_address"] == "Av. Juárez 10"
    assert datos["business_phone"] == "555-0101"
    assert datos["business_rfc"] == "FCE010101AB1"


def test_rf43_branding_conserva_el_respaldo_business(client, db):
    # Instalación anterior: solo claves business_* (company_name no está guardado, solo su valor por omisión)
    for clave, valor in {
        "business_name": "Tlapalería Vieja",
        "business_address": "Calle 5",
        "business_phone": "555-0202",
        "business_rfc": "TVI010101AB1",
    }.items():
        config_service.set_value(clave, valor)
    db.session.commit()

    datos = client.get("/api/config/branding").get_json()
    assert datos["company_name"] == "Tlapalería Vieja"
    assert datos["business_address"] == "Calle 5"
    assert datos["business_phone"] == "555-0202"
    assert datos["business_rfc"] == "TVI010101AB1"


def test_rf43_company_tiene_prioridad_sobre_business(client, db):
    config_service.set_value("business_address", "Dirección vieja")
    config_service.set_value("company_address", "Dirección nueva")
    config_service.set_value("business_name", "Nombre viejo")
    config_service.set_value("company_name", "Nombre nuevo")
    db.session.commit()

    datos = client.get("/api/config/branding").get_json()
    assert datos["business_address"] == "Dirección nueva"
    assert datos["company_name"] == "Nombre nuevo"


# ── RF-44: parámetros de reportes ────────────────────────────────────────────────────────

@pytest.mark.parametrize("limite", ["-1", "0", "abc", "101", "2.5"])
def test_rf44_limit_fuera_de_rango_responde_400(client, admin_token, limite):
    resp = client.get(f"/api/reports/top-products?limit={limite}", headers=_h(admin_token))
    assert resp.status_code == 400
    assert "limit" in resp.get_json()["error"]


def test_rf44_limit_valido_sigue_funcionando(client, admin_token):
    for limite in ("1", "20", "100"):
        assert client.get(f"/api/reports/top-products?limit={limite}", headers=_h(admin_token)).status_code == 200
    assert client.get("/api/reports/top-products", headers=_h(admin_token)).status_code == 200


@pytest.mark.parametrize("ruta", ["/api/reports/sales", "/api/reports/top-products", "/api/reports/gross-margin"])
def test_rf44_rango_de_anios_extremo_responde_400_no_500(client, admin_token, ruta):
    resp = client.get(f"{ruta}?from=0001-01-01&to=9999-12-31", headers=_h(admin_token))
    assert resp.status_code == 400
    assert "2000" in resp.get_json()["error"]
    # Solo un extremo fuera del rango también se rechaza
    assert client.get(f"{ruta}?to=9999-12-31", headers=_h(admin_token)).status_code == 400


@pytest.mark.parametrize("ruta", ["/api/reports/sales", "/api/reports/top-products", "/api/reports/gross-margin"])
def test_rf44_from_posterior_a_to_responde_400(client, admin_token, ruta):
    resp = client.get(f"{ruta}?from=2026-10-10&to=2026-10-01", headers=_h(admin_token))
    assert resp.status_code == 400
    assert "anterior" in resp.get_json()["error"]
    # Un solo día (from == to) es válido
    assert client.get(f"{ruta}?from=2026-10-10&to=2026-10-10", headers=_h(admin_token)).status_code == 200


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


# ── RF-47: retención de los pre-restore ──────────────────────────────────────────────────

def _pre_restore(directorio, n):
    nombres = [f"pre-restore-202610{dia:02d}_120000.dump" for dia in range(1, n + 1)]
    for nombre in nombres:
        (directorio / nombre).write_bytes(b"x")
    return nombres


def test_rf47_retencion_conserva_solo_los_pre_restore_mas_recientes(app, db, tmp_path):
    app.config["BACKUP_DIR"] = str(tmp_path)
    nombres = _pre_restore(tmp_path, 8)
    (tmp_path / "backup_pos_db_20261001_120000.dump").write_bytes(b"x")

    resultado = backup_service.apply_retention()

    quedan = sorted(f.name for f in tmp_path.glob("pre-restore-*.dump"))
    assert quedan == nombres[-backup_service.PRE_RESTORE_KEEP:]
    assert resultado["pre_restore_deleted"] == 8 - backup_service.PRE_RESTORE_KEEP
    # Los respaldos normales siguen su propia política
    assert (tmp_path / "backup_pos_db_20261001_120000.dump").exists()


def test_rf47_se_depuran_aunque_no_haya_respaldos_normales(app, db, tmp_path):
    app.config["BACKUP_DIR"] = str(tmp_path)
    _pre_restore(tmp_path, backup_service.PRE_RESTORE_KEEP + 2)
    (tmp_path / "notas.txt").write_text("no se toca")

    backup_service.apply_retention()

    assert len(list(tmp_path.glob("pre-restore-*.dump"))) == backup_service.PRE_RESTORE_KEEP
    assert (tmp_path / "notas.txt").exists()


# ── Dashboard (pendientes de Fase 3) ─────────────────────────────────────────────────────

def _producto(db, unidad, sku, cantidad, minimo, activo=True):
    p = Product(sku=sku, name=sku, unit_id=unidad.id, sale_price=Decimal("10.00"),
                min_stock=Decimal(minimo), is_active=activo)
    db.session.add(p)
    db.session.flush()
    if cantidad is not None:
        db.session.add(Stock(product_id=p.id, quantity=Decimal(cantidad)))
    return p


def test_dashboard_stock_bajo_coincide_con_kpi_de_inventario(client, db, admin_token):
    unidad = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unidad)
    db.session.flush()
    _producto(db, unidad, "AGOTADO-SIN-MIN", "0", "0")        # agotado sin mínimo: cuenta
    _producto(db, unidad, "AGOTADO-CON-MIN", "0", "3")        # agotado con mínimo: cuenta una sola vez
    _producto(db, unidad, "SIN-REGISTRO", None, "0")          # sin fila de stock = 0: cuenta
    _producto(db, unidad, "IGUAL-AL-MIN", "5", "5")           # en el mínimo: cuenta (antes no)
    _producto(db, unidad, "BAJO-MIN", "3", "5")               # bajo mínimo: cuenta
    _producto(db, unidad, "SOBRADO", "10", "5")               # no cuenta
    _producto(db, unidad, "SIN-MIN-CON-STOCK", "4", "0")      # no cuenta
    _producto(db, unidad, "INACTIVO", "0", "5", activo=False)  # inactivo: no cuenta
    db.session.commit()

    dashboard = client.get("/api/reports/dashboard", headers=_h(admin_token)).get_json()
    resumen = client.get("/api/inventory/summary", headers=_h(admin_token)).get_json()
    assert dashboard["low_stock_count"] == 5
    assert dashboard["low_stock_count"] == resumen["out_of_stock"] + resumen["below_min"]


def test_dashboard_dia_solo_con_devoluciones_muestra_el_neto_negativo(client, db, admin_token, caja):  # noqa: F811
    hoy = local_today()
    # La venta es de hace dos días y de otra sesión (ya cerrada); hoy solo hay una devolución en la caja abierta
    otra = CashRegisterSession(
        cash_register_id=caja.cash_register_id, user_id=caja.user_id,
        opening_amount=Decimal("0.00"), status="cerrada",
    )
    db.session.add(otra)
    db.session.commit()
    venta_vieja = _venta(db, caja, hoy - timedelta(days=2), "116.00", "efectivo")
    venta_vieja.session_id = otra.id
    db.session.commit()
    _devolucion(db, caja, venta_vieja, hoy, "116.00", "efectivo")

    datos = client.get("/api/reports/dashboard", headers=_h(admin_token)).get_json()
    assert datos["sales_today"] == 0
    assert datos["revenue_today"] == "-116.00"
    turno = next(s for s in datos["open_sessions"] if s["id"] == caja.id)
    assert turno["revenue"] == "-116.00"
    assert turno["count"] == 0
