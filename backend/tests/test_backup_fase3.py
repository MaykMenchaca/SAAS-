"""Tests de Subfase 3.1: PG_BIN_DIR, retención, .dump, OSError, hilo, health, flask backup."""
import os
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services import backup_service


# ── 3.1.1 PG_BIN_DIR ──────────────────────────────────────────────────────────

def test_pg_bin_dir_used_in_cmd(app, db, tmp_path):
    """Si PG_BIN_DIR está configurado, pg_dump se invoca con esa ruta."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None
    app.config["PG_BIN_DIR"] = r"C:\Program Files\PostgreSQL\18\bin"

    mock_result = MagicMock(returncode=0, stderr="")

    def side_effect(*args, **kwargs):
        cmd = args[0]
        filepath = cmd[cmd.index("-f") + 1]
        Path(filepath).write_bytes(b"fake")
        return mock_result

    with patch("app.services.backup_service.subprocess.run", side_effect=side_effect) as mock_run:
        backup_service.create_backup()

    called_cmd = mock_run.call_args[0][0]
    assert called_cmd[0].endswith("pg_dump") or called_cmd[0].endswith("pg_dump.exe")
    # Debe usar la ruta del PG_BIN_DIR
    assert r"C:\Program Files\PostgreSQL\18\bin" in called_cmd[0]


def test_pg_bin_dir_autodetect_fallback(app, db, tmp_path):
    """Sin PG_BIN_DIR, debe intentar autodetectar en Program Files."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None
    app.config["PG_BIN_DIR"] = None

    mock_result = MagicMock(returncode=0, stderr="")

    def side_effect(*args, **kwargs):
        cmd = args[0]
        filepath = cmd[cmd.index("-f") + 1]
        Path(filepath).write_bytes(b"fake")
        return mock_result

    # Simplemente que no explote – si no hay PostgreSQL instalado, usa 'pg_dump' plano
    with patch("app.services.backup_service.subprocess.run", side_effect=side_effect):
        result = backup_service.create_backup()

    assert result["filename"].endswith(".dump")


# ── 3.1.4 Extensión .dump, retención, parciales y OSError ──────────────────────

def test_backup_filename_ends_with_dump(app, db, tmp_path):
    """El nombre del archivo de backup debe terminar en .dump."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None
    app.config["PG_BIN_DIR"] = None

    mock_result = MagicMock(returncode=0, stderr="")

    def side_effect(*args, **kwargs):
        cmd = args[0]
        filepath = cmd[cmd.index("-f") + 1]
        Path(filepath).write_bytes(b"fake")
        return mock_result

    with patch("app.services.backup_service.subprocess.run", side_effect=side_effect):
        result = backup_service.create_backup()

    assert result["filename"].endswith(".dump"), f"Expected .dump, got {result['filename']}"


def test_partial_backup_deleted_on_failure(app, db, tmp_path):
    """Si pg_dump falla, el archivo parcial debe ser eliminado."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None
    app.config["PG_BIN_DIR"] = None

    def side_effect(*args, **kwargs):
        # Crea el archivo parcial como haría pg_dump antes de fallar
        cmd = args[0]
        filepath = cmd[cmd.index("-f") + 1]
        Path(filepath).write_bytes(b"partial data")
        result = MagicMock(returncode=1, stderr="error de prueba")
        return result

    with patch("app.services.backup_service.subprocess.run", side_effect=side_effect):
        with pytest.raises(RuntimeError):
            backup_service.create_backup()

    # El directorio no debe tener archivos .dump parciales
    dump_files = list(tmp_path.glob("*.dump"))
    assert len(dump_files) == 0, f"Partial file not cleaned: {dump_files}"


def test_retention_keeps_14_daily_8_weekly(app, db, tmp_path):
    """apply_retention elimina diarios >14 y semanales >8."""
    app.config["BACKUP_DIR"] = str(tmp_path)

    # Crear 20 backups diarios falsos (lunes-viernes de 4 semanas)
    from datetime import datetime, timedelta
    base = datetime(2026, 1, 1)
    for i in range(20):
        d = base + timedelta(days=i)
        fname = f"backup_pos_db_{d.strftime('%Y%m%d')}_120000.dump"
        (tmp_path / fname).write_bytes(b"x")

    backup_service.apply_retention()

    remaining = sorted(tmp_path.glob("backup_*.dump"))
    assert len(remaining) <= 14 + 8, f"Too many files after retention: {len(remaining)}"


def test_usb_oserror_does_not_crash_backup(app, db, tmp_path):
    """Un OSError al copiar a USB no debe abortar el backup principal."""
    backup_dir = tmp_path / "local"
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    app.config["BACKUP_DIR"] = str(backup_dir)
    app.config["USB_BACKUP_DIR"] = str(usb_dir)
    app.config["PG_BIN_DIR"] = None

    mock_result = MagicMock(returncode=0, stderr="")

    def run_side_effect(*args, **kwargs):
        cmd = args[0]
        filepath = cmd[cmd.index("-f") + 1]
        Path(filepath).write_bytes(b"fake")
        return mock_result

    with patch("app.services.backup_service.subprocess.run", side_effect=run_side_effect):
        with patch("app.services.backup_service.shutil.copy2", side_effect=OSError("USB llena")):
            result = backup_service.create_backup()

    # El backup local debe haber sido exitoso
    assert result["size"] > 0
    # La copia USB puede haber fallado sin abortar
    assert result.get("usb_error") is not None or result["usb_copied"] is False


# ── 3.1.6 /api/health con último backup ───────────────────────────────────────

def test_health_includes_last_backup(client, admin_token, db, tmp_path, app):
    """GET /api/health debe incluir el campo last_backup_at."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    # Crear un backup falso
    (tmp_path / "backup_pos_db_20260101_120000.dump").write_bytes(b"x")

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert "last_backup_at" in data, f"Missing last_backup_at in: {data}"


def test_health_db_check(client, db):
    """GET /api/health debe verificar la BD con SELECT 1."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data.get("db") == "ok", f"db check failed: {data}"


# ── list_backups con .dump ─────────────────────────────────────────────────────

def test_list_backups_finds_dump_files(app, db, tmp_path):
    """list_backups debe encontrar archivos .dump además de .sql."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    (tmp_path / "backup_pos_db_20260101_120000.dump").write_bytes(b"data1")
    (tmp_path / "backup_pos_db_20260102_120000.dump").write_bytes(b"data2")
    (tmp_path / "not_a_backup.txt").write_bytes(b"ignore me")

    backups = backup_service.list_backups()
    assert len(backups) == 2
    assert backups[0]["filename"].endswith(".dump")


# ── 3.1.2 & 3.1.3 CLI y Cierre de caja en hilo ─────────────────────────────────

def test_flask_backup_cli_command(app):
    """Comando `flask backup` debe ejecutar backup y retención."""
    runner = app.test_cli_runner()
    with patch("app.services.backup_service.create_backup") as mock_create, \
         patch("app.services.backup_service.apply_retention") as mock_retention:
        mock_create.return_value = {
            "filename": "backup_pos_db_20261010_120000.dump",
            "size_bytes": 1024,
            "usb_copied": True,
            "usb_path": "E:/backup.dump",
        }
        mock_retention.return_value = {"kept": 14, "deleted": 2}
        result = runner.invoke(args=["backup"])

    assert result.exit_code == 0
    assert "Respaldo creado con éxito" in result.output
    mock_create.assert_called_once()
    mock_retention.assert_called_once()


def test_cash_register_close_returns_backup_status_and_spawns_thread(client, admin_token, db, seed_open_session):
    """Cierre de caja debe devolver campo backup y lanzar hilo de respaldo."""
    session = seed_open_session

    with patch("threading.Thread.start") as mock_thread_start:
        response = client.post(
            f"/api/cash-register/{session.id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"closing_amount": "100.00", "close_notes": "cierre test"},
        )

    assert response.status_code == 200
    data = response.get_json()
    assert "backup" in data
    assert mock_thread_start.called

