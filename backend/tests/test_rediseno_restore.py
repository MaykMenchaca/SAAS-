"""Subfase 7.4: restaurar un respaldo desde la web.

SEGURIDAD DE LAS PRUEBAS: la base de pruebas es compartida entre los agentes (cada uno con su esquema
``lane_X``). Por eso estas pruebas limitan pg_dump/pg_restore al esquema actual (``BACKUP_PG_SCHEMA``):
el respaldo solo contiene ese esquema y la restauración (--clean) solo puede tocarlo. Además
``RESTORE_TERMINATE_CONNECTIONS`` va en falso para no cerrar las conexiones de otros agentes; el SQL
de cierre de conexiones se prueba aparte con una base simulada. Nunca se restaura sobre ``pos_db``.
"""
import subprocess
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.models.audit import AuditLog
from app.models.user import Permission, Role, User
from app.services import backup_service, restore_service
from app.utils import maintenance


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def aislado(app, db, tmp_path):
    """Configura respaldos reales pero limitados al esquema del carril de pruebas."""
    esquema = db.session.execute(db.text("SELECT current_schema()")).scalar()
    assert esquema.startswith("lane_"), f"Las pruebas de restauración exigen un esquema lane_*, no {esquema!r}"
    db.session.commit()

    claves = {
        "BACKUP_DIR": str(tmp_path / "respaldos"),
        "USB_BACKUP_DIR": None,
        "PG_BIN_DIR": None,
        "BACKUP_PG_SCHEMA": esquema,
        "RESTORE_TERMINATE_CONNECTIONS": False,
        "MAINTENANCE_FLAG_FILE": str(tmp_path / "flag-mantenimiento"),
    }
    previos = {k: app.config.get(k) for k in claves}
    (tmp_path / "respaldos").mkdir(exist_ok=True)
    app.config.update(claves)
    restore_service.reset_state_for_tests()
    maintenance.leave()

    eventos: list[str] = []

    def migraciones():
        eventos.append("migraciones")

    with patch.object(restore_service, "_run_migrations", migraciones):
        yield {"dir": tmp_path / "respaldos", "eventos": eventos}

    restore_service.wait_until_finished(60)
    maintenance.leave()
    restore_service.reset_state_for_tests()
    app.config.update(previos)


@pytest.fixture
def comandos_pg_restore(monkeypatch):
    """Registra los comandos pg_restore (y deja pasar todo lo demás a subprocess real)."""
    real = subprocess.run
    llamados: list[list[str]] = []

    def espia(cmd, *args, **kwargs):
        if "pg_restore" in Path(cmd[0]).name and "--list" not in cmd:
            llamados.append(list(cmd))
        return real(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", espia)
    return llamados


def _crear_respaldo(client, token):
    resp = client.post("/api/backup/", headers=_auth(token))
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["filename"]


def _restaurar(client, token, nombre, confirm=None):
    return client.post(
        f"/api/backup/{nombre}/restore",
        headers=_auth(token),
        json={"confirm": confirm if confirm is not None else f"RESTAURAR {nombre}"},
    )


def _esperar_fin():
    assert restore_service.wait_until_finished(120), "La restauración no terminó a tiempo"
    return restore_service.get_status()


def _conteos():
    return {
        "usuarios": User.query.count(),
        "roles": Role.query.count(),
        "permisos": Permission.query.count(),
    }


def _ensuciar(db):
    """Cambia los datos después del respaldo: un rol nuevo y un usuario nuevo."""
    rol = Role(name="extra", description="Rol agregado después del respaldo")
    db.session.add(rol)
    db.session.flush()
    u = User(username="nuevo", email="n@test.com", full_name="Nuevo", role_id=rol.id)
    u.set_password("nuevo1234")
    db.session.add(u)
    db.session.commit()
    db.session.remove()


# ── Validaciones de entrada ───────────────────────────────────────────────────────────────


def test_sin_confirmacion_responde_400_y_no_hace_nada(client, aislado, admin_token):
    nombre = _crear_respaldo(client, admin_token)
    for cuerpo in ({}, {"confirm": ""}, {"confirm": "restaurar " + nombre}, {"confirm": "RESTAURAR otro.dump"}):
        resp = client.post(f"/api/backup/{nombre}/restore", headers=_auth(admin_token), json=cuerpo)
        assert resp.status_code == 400
    assert restore_service.get_status()["state"] == restore_service.STATE_IDLE
    assert not maintenance.is_active()
    assert not list(aislado["dir"].glob("pre-restore-*"))


@pytest.mark.parametrize("nombre", ["no_existe.dump", "..%5Csecreto.dump", "%2E%2E%5Cx.dump", "backup_pos_db_29990101_000000.dump"])
def test_nombre_invalido_responde_400(client, aislado, admin_token, nombre):
    resp = _restaurar(client, admin_token, nombre)
    assert resp.status_code == 400
    assert not maintenance.is_active()


def test_nombre_que_existe_pero_no_es_respaldo_listado(client, aislado, admin_token):
    (aislado["dir"] / "ajeno.txt").write_text("x")
    assert _restaurar(client, admin_token, "ajeno.txt").status_code == 400


def test_solo_admin_puede_restaurar(client, aislado, admin_token, regular_user_token):
    nombre = _crear_respaldo(client, admin_token)
    assert _restaurar(client, regular_user_token, nombre).status_code == 403
    assert client.post(f"/api/backup/{nombre}/restore", json={"confirm": f"RESTAURAR {nombre}"}).status_code == 401
    assert not maintenance.is_active()


def test_respaldo_ilegible_no_toca_nada(client, aislado, admin_token):
    aislado["dir"].mkdir(parents=True, exist_ok=True)
    (aislado["dir"] / "backup_pos_db_20260101_000000.dump").write_bytes(b"esto no es un dump")
    resp = _restaurar(client, admin_token, "backup_pos_db_20260101_000000.dump")
    assert resp.status_code == 500
    assert not maintenance.is_active()
    assert not list(aislado["dir"].glob("pre-restore-*"))


def test_si_falla_el_respaldo_previo_se_aborta(client, aislado, admin_token, comandos_pg_restore):
    nombre = _crear_respaldo(client, admin_token)
    with patch.object(backup_service, "create_backup", side_effect=RuntimeError("disco lleno")):
        resp = _restaurar(client, admin_token, nombre)
    assert resp.status_code == 500
    assert "respaldo previo" in resp.get_json()["error"]
    assert comandos_pg_restore == []
    assert not maintenance.is_active()
    assert restore_service.get_status()["state"] == restore_service.STATE_IDLE


def test_no_permite_dos_restauraciones_a_la_vez(client, aislado, admin_token):
    nombre = _crear_respaldo(client, admin_token)
    restore_service._write_status(state=restore_service.STATE_RUNNING, started_ts=time.time())
    resp = _restaurar(client, admin_token, nombre)
    assert resp.status_code == 409


# ── Restauración real (limitada al esquema del carril) ────────────────────────────────────


def test_restauracion_exitosa_deja_los_mismos_conteos(client, db, aislado, admin_token, comandos_pg_restore):
    antes = _conteos()
    nombre = _crear_respaldo(client, admin_token)
    _ensuciar(db)
    assert _conteos() != antes

    resp = _restaurar(client, admin_token, nombre)
    assert resp.status_code == 202, resp.get_json()
    status = _esperar_fin()
    assert status["state"] == restore_service.STATE_OK, status

    assert _conteos() == antes
    assert Role.query.filter_by(name="extra").first() is None

    # Protocolo: respaldo previo, banderas de seguridad, migraciones después de restaurar
    assert list(aislado["dir"].glob("pre-restore-*.dump"))
    assert len(comandos_pg_restore) == 1
    cmd = comandos_pg_restore[0]
    for bandera in ("--clean", "--if-exists", "--single-transaction", "--exit-on-error"):
        assert bandera in cmd
    assert cmd[-1].endswith(nombre)
    assert aislado["eventos"] == ["migraciones"]

    # Sale de mantenimiento y queda auditado en la base restaurada
    assert not maintenance.is_active()
    entrada = AuditLog.query.filter_by(action="restore", entity_type="backup").one()
    assert entrada.details["filename"] == nombre
    assert entrada.details["result"] == "ok"
    assert entrada.username == "admin"

    # Todas las sesiones se cierran: el token anterior ya no sirve
    assert client.get("/api/backup/", headers=_auth(admin_token)).status_code == 401


def test_fallo_a_mitad_de_la_restauracion_deja_la_base_como_antes(client, db, aislado, admin_token, comandos_pg_restore):
    """Falla en las migraciones DESPUÉS de restaurar: se recupera el respaldo previo."""
    nombre = _crear_respaldo(client, admin_token)
    _ensuciar(db)
    estado_antes = _conteos()

    with patch.object(restore_service, "_run_migrations", side_effect=RuntimeError("migración rota")):
        resp = _restaurar(client, admin_token, nombre)
        assert resp.status_code == 202
        status = _esperar_fin()

    assert status["state"] == restore_service.STATE_ERROR
    assert "migración rota" in status["message"]
    assert "Se recuperó el estado anterior" in status["message"]
    # La base quedó como estaba justo antes de intentar restaurar (con lo agregado después del respaldo)
    assert _conteos() == estado_antes
    assert Role.query.filter_by(name="extra").first() is not None
    # Se restauró dos veces: el respaldo pedido y luego el previo
    assert len(comandos_pg_restore) == 2
    assert Path(comandos_pg_restore[1][-1]).name.startswith("pre-restore-")
    assert not maintenance.is_active()
    # El token sigue siendo válido: no se cerraron sesiones porque no hubo restauración
    assert client.get("/api/backup/", headers=_auth(admin_token)).status_code == 200


def test_falla_pg_restore_y_se_recupera_el_previo(client, db, aislado, admin_token, monkeypatch):
    nombre = _crear_respaldo(client, admin_token)
    _ensuciar(db)
    estado_antes = _conteos()

    real = subprocess.run
    llamados: list[str] = []

    def falla_la_primera(cmd, *args, **kwargs):
        if "pg_restore" in Path(cmd[0]).name and "--list" not in cmd:
            llamados.append(cmd[-1])
            if len(llamados) == 1:
                return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="pg_restore: error: simulado a mitad")
        return real(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", falla_la_primera)
    assert _restaurar(client, admin_token, nombre).status_code == 202
    status = _esperar_fin()

    assert status["state"] == restore_service.STATE_ERROR
    assert "simulado a mitad" in status["message"]
    assert _conteos() == estado_antes
    assert Path(llamados[1]).name.startswith("pre-restore-")
    assert aislado["eventos"] == []  # no se migró nada
    assert not maintenance.is_active()


def test_si_tambien_falla_la_reversion_se_informa_el_archivo_previo(client, db, aislado, admin_token, monkeypatch):
    nombre = _crear_respaldo(client, admin_token)
    monkeypatch.setattr(
        restore_service, "_pg_restore", MagicMock(side_effect=RuntimeError("pg_restore falló"))
    )
    assert _restaurar(client, admin_token, nombre).status_code == 202
    status = _esperar_fin()
    assert status["state"] == restore_service.STATE_ERROR
    assert "pre-restore-" in status["message"]
    assert not maintenance.is_active()


# ── Modo mantenimiento ────────────────────────────────────────────────────────────────────


def test_en_mantenimiento_la_api_responde_503_pero_health_y_estado_no(client, app, aislado, admin_token):
    maintenance.enter()
    try:
        resp = client.get("/api/backup/", headers=_auth(admin_token))
        assert resp.status_code == 503
        datos = resp.get_json()
        assert datos["maintenance"] is True
        assert datos["code"] == "maintenance"
        assert "mantenimiento" in datos["error"]
        assert resp.headers["Retry-After"]

        assert client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).status_code == 503
        assert client.get("/api/health").status_code == 200
        estado = client.get("/api/backup/restore-status")
        assert estado.status_code == 200
        assert estado.get_json()["state"] in {"inactivo", "en_curso", "ok", "error"}
    finally:
        maintenance.leave()
    assert client.get("/api/backup/", headers=_auth(admin_token)).status_code == 200


def test_la_bandera_de_mantenimiento_caduca(app, aislado):
    app.config["MAINTENANCE_MAX_SECONDS"] = 1
    try:
        maintenance.enter()
        assert maintenance.is_active()
        time.sleep(1.2)
        assert not maintenance.is_active()
    finally:
        app.config.pop("MAINTENANCE_MAX_SECONDS", None)
        maintenance.leave()


def test_la_bandera_tambien_se_ve_desde_otro_proceso(app, aislado):
    """Otro proceso solo ve el archivo: sin memoria, la bandera sigue activa."""
    maintenance.enter()
    try:
        maintenance._memory_since = None  # simula otro proceso
        assert maintenance.is_active()
    finally:
        maintenance.leave()
    assert not maintenance.is_active()


# ── Cierre de conexiones ──────────────────────────────────────────────────────────────────


def test_cierra_solo_las_otras_conexiones_de_la_misma_base(app):
    app.config["RESTORE_TERMINATE_CONNECTIONS"] = True
    try:
        falsa = MagicMock()
        falsa.session.execute.return_value.fetchall.return_value = [(True,), (True,)]
        with patch.object(restore_service, "db", falsa):
            cerradas = restore_service._terminate_other_connections()
        assert cerradas == 2
        sql = str(falsa.session.execute.call_args[0][0])
        falsa.text.assert_called_once()
        consulta = falsa.text.call_args[0][0]
        assert "pg_terminate_backend" in consulta
        assert "pid <> pg_backend_pid()" in consulta
        assert "datname = current_database()" in consulta
        assert "usename = current_user" in consulta
        del sql
    finally:
        app.config["RESTORE_TERMINATE_CONNECTIONS"] = False


def test_no_cierra_conexiones_si_esta_desactivado(app):
    app.config["RESTORE_TERMINATE_CONNECTIONS"] = False
    falsa = MagicMock()
    with patch.object(restore_service, "db", falsa):
        assert restore_service._terminate_other_connections() == 0
    falsa.session.execute.assert_not_called()


# ── Estado ────────────────────────────────────────────────────────────────────────────────


def test_estado_inicial_inactivo_y_sin_datos_internos(client, aislado):
    datos = client.get("/api/backup/restore-status").get_json()
    assert datos["state"] == "inactivo"
    assert "started_ts" not in datos and "pre_restore_file" not in datos
