"""Tests de Subfase 3.2: Restauración segura (H-13)."""
import os
import re
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from app.services import backup_service
from app.extensions import db
from app.models.user import User


def test_restore_script_has_safety_flags():
    """restore-backup.ps1 debe incluir --single-transaction, --exit-on-error, y respaldo previo."""
    script_path = Path(__file__).parents[2] / "restore-backup.ps1"
    assert script_path.exists(), "restore-backup.ps1 no existe"
    content = script_path.read_text(encoding="utf-8")

    assert "--single-transaction" in content, "Falta --single-transaction en pg_restore"
    assert "--exit-on-error" in content, "Falta --exit-on-error en pg_restore"
    assert "PG_BIN_DIR" in content, "Falta soporte para PG_BIN_DIR en restore-backup.ps1"
    assert "pre_restore" in content.lower() or "respaldo previo" in content.lower(), (
        "restore-backup.ps1 debe realizar un respaldo de seguridad previo antes de restaurar"
    )


def test_restore_script_reads_env_file():
    """restore-backup.ps1 debe leer DATABASE_URL de backend/.env si no está en entorno."""
    script_path = Path(__file__).parents[2] / "restore-backup.ps1"
    content = script_path.read_text(encoding="utf-8")
    assert ".env" in content, "restore-backup.ps1 debe buscar y leer el archivo .env"


def test_restore_script_checks_service_status():
    """restore-backup.ps1 debe advertir o verificar si el servicio backend está corriendo."""
    script_path = Path(__file__).parents[2] / "restore-backup.ps1"
    content = script_path.read_text(encoding="utf-8")
    assert "Get-Service" in content or "servicio" in content.lower(), (
        "restore-backup.ps1 debe verificar el estado del servicio de backend"
    )


def test_drill_documentation_exists():
    """Debe existir la documentación de simulacro trimestral en docs/simulacro-restauracion.md."""
    doc_path = Path(__file__).parents[2] / "docs" / "simulacro-restauracion.md"
    assert doc_path.exists(), "docs/simulacro-restauracion.md no existe"
    content = doc_path.read_text(encoding="utf-8")
    assert "simulacro" in content.lower()
    assert "trimestral" in content.lower()
    assert "restore-backup.ps1" in content


def test_backup_and_verify_cycle_integration(app, db, seed_admin, tmp_path):
    """Integración de ciclo: crear respaldo con datos, verificar lectura de catálogo con pg_restore."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None

    # Asegurar que hay al menos un usuario
    user_count = User.query.count()
    assert user_count >= 1

    # Ejecutar create_backup real
    # Nota: si pg_dump no está en PATH o fallará en CI/local sin PostgreSQL tools,
    # verificamos el formato del comando y la llamada.
    def side_effect(*args, **kwargs):
        cmd = args[0]
        if "-f" in cmd:
            filepath = cmd[cmd.index("-f") + 1]
            Path(filepath).write_bytes(b"DUMP_CONTENT")
        return MagicMock(returncode=0, stdout="; Archive created\n123; TABLE DATA\n", stderr="")

    with patch("app.services.backup_service.subprocess.run", side_effect=side_effect):
        res = backup_service.create_backup()
        assert Path(res["path"]).exists()

        # Verificar el backup creado
        verify_res = backup_service.verify_backup(res["filename"])
        assert verify_res["verified"] is True
        assert verify_res["entries"] > 0
