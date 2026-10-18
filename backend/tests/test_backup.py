"""Tests for backup service and API."""
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services import backup_service


# --- Service tests (mocked pg_dump) ---


def test_create_backup_success(app, db, tmp_path):
    """create_backup should call pg_dump and return backup info."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stderr = ""

    with patch("app.services.backup_service.subprocess.run", return_value=mock_result) as mock_run:
        # Create a fake file so stat works
        def side_effect(*args, **kwargs):
            # Extract filename from the -f argument
            cmd = args[0]
            filepath = cmd[cmd.index("-f") + 1]
            Path(filepath).write_bytes(b"fake backup data")
            return mock_result

        mock_run.side_effect = side_effect
        result = backup_service.create_backup()

    assert result["filename"].startswith("backup_")
    assert result["size"] > 0
    assert result["size_bytes"] > 0
    assert result["usb_copied"] is False
    assert result["usb_path"] is None
    assert "created_at" in result
    mock_run.assert_called_once()


def test_create_backup_copies_to_usb_when_mounted(app, db, tmp_path):
    """create_backup should copy to USB_BACKUP_DIR when the path exists."""
    backup_dir = tmp_path / "local"
    usb_dir = tmp_path / "usb"
    usb_dir.mkdir()
    app.config["BACKUP_DIR"] = str(backup_dir)
    app.config["USB_BACKUP_DIR"] = str(usb_dir)

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stderr = ""

    def side_effect(*args, **kwargs):
        cmd = args[0]
        filepath = cmd[cmd.index("-f") + 1]
        Path(filepath).write_bytes(b"fake backup data")
        return mock_result

    with patch(
        "app.services.backup_service.subprocess.run",
        side_effect=side_effect,
    ):
        result = backup_service.create_backup()

    assert result["usb_copied"] is True
    assert result["usb_path"] is not None
    assert Path(result["usb_path"]).exists()
    assert Path(result["usb_path"]).parent == usb_dir / "pos-system-backups"


def test_create_backup_pg_dump_not_found(app, db, tmp_path):
    """create_backup should raise RuntimeError if pg_dump not found."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None

    with patch(
        "app.services.backup_service.subprocess.run",
        side_effect=FileNotFoundError,
    ):
        try:
            backup_service.create_backup()
            assert False, "Should have raised RuntimeError"
        except RuntimeError as e:
            assert "pg_dump no encontrado" in str(e)


def test_create_backup_pg_dump_fails(app, db, tmp_path):
    """create_backup should raise RuntimeError on pg_dump failure."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    app.config["USB_BACKUP_DIR"] = None

    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "connection refused"

    with patch(
        "app.services.backup_service.subprocess.run",
        return_value=mock_result,
    ):
        try:
            backup_service.create_backup()
            assert False, "Should have raised RuntimeError"
        except RuntimeError as e:
            assert "pg_dump fallo" in str(e)


def test_list_backups(app, db, tmp_path):
    """list_backups should return sorted backup file info."""
    app.config["BACKUP_DIR"] = str(tmp_path)

    # Create fake backup files
    (tmp_path / "backup_pos_db_20260101_120000.sql").write_bytes(b"data1")
    (tmp_path / "backup_pos_db_20260102_120000.sql").write_bytes(b"data2")
    (tmp_path / "not_a_backup.txt").write_bytes(b"ignore me")

    backups = backup_service.list_backups()
    assert len(backups) == 2
    assert backups[0]["filename"] == "backup_pos_db_20260102_120000.sql"
    assert backups[1]["filename"] == "backup_pos_db_20260101_120000.sql"


def test_delete_backup(app, db, tmp_path):
    """delete_backup should remove the backup file."""
    app.config["BACKUP_DIR"] = str(tmp_path)

    backup_file = tmp_path / "backup_pos_db_20260101_120000.sql"
    backup_file.write_bytes(b"data")

    assert backup_service.delete_backup("backup_pos_db_20260101_120000.sql")
    assert not backup_file.exists()


def test_delete_backup_not_found(app, db, tmp_path):
    """delete_backup should return False for nonexistent file."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    assert not backup_service.delete_backup("nonexistent.sql")


def test_delete_backup_path_traversal(app, db, tmp_path):
    """delete_backup should reject path traversal attempts."""
    app.config["BACKUP_DIR"] = str(tmp_path)

    try:
        backup_service.delete_backup("../../../etc/passwd")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "invalido" in str(e)


def test_verify_backup_success(app, db, tmp_path):
    """verify_backup should call pg_restore --list and count archive entries."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    backup_file = tmp_path / "backup_pos_db_20260101_120000.sql"
    backup_file.write_bytes(b"data")

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = ";\n; Archive created\n123; TABLE public products\n124; TABLE DATA public products\n"
    mock_result.stderr = ""

    with patch(
        "app.services.backup_service.subprocess.run",
        return_value=mock_result,
    ) as mock_run:
        result = backup_service.verify_backup(backup_file.name)

    assert result["verified"] is True
    assert result["entries"] == 2
    mock_run.assert_called_once()


def test_verify_backup_not_found(app, db, tmp_path):
    """verify_backup should raise FileNotFoundError for missing files."""
    app.config["BACKUP_DIR"] = str(tmp_path)

    try:
        backup_service.verify_backup("missing.sql")
        assert False, "Should have raised FileNotFoundError"
    except FileNotFoundError:
        pass


# --- API tests ---


def test_backup_list_requires_admin(client, db):
    """GET /api/backup/ should require admin role."""
    response = client.get("/api/backup/")
    assert response.status_code == 401


def test_backup_list_non_admin_forbidden(client, regular_user_token, db):
    """GET /api/backup/ should reject non-admin users."""
    response = client.get(
        "/api/backup/",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert response.status_code == 403


def test_backup_list_returns_empty(client, admin_token, db, tmp_path, app):
    """GET /api/backup/ should return empty list when no backups."""
    app.config["BACKUP_DIR"] = str(tmp_path)

    response = client.get(
        "/api/backup/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["backups"] == []


def test_backup_create_api(client, admin_token, db, tmp_path, app):
    """POST /api/backup/ should create a backup."""
    app.config["BACKUP_DIR"] = str(tmp_path)

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stderr = ""

    def side_effect(*args, **kwargs):
        cmd = args[0]
        filepath = cmd[cmd.index("-f") + 1]
        Path(filepath).write_bytes(b"fake backup")
        return mock_result

    with patch(
        "app.services.backup_service.subprocess.run",
        side_effect=side_effect,
    ):
        response = client.post(
            "/api/backup/",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    assert response.status_code == 201
    data = response.get_json()
    assert data["filename"].startswith("backup_")


def test_backup_delete_api(client, admin_token, db, tmp_path, app):
    """DELETE /api/backup/<filename> should delete a backup."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    backup_file = tmp_path / "backup_test_20260101_120000.sql"
    backup_file.write_bytes(b"data")

    response = client.delete(
        "/api/backup/backup_test_20260101_120000.sql",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert not backup_file.exists()


def test_backup_verify_api(client, admin_token, db, tmp_path, app):
    """POST /api/backup/<filename>/verify should verify a backup."""
    app.config["BACKUP_DIR"] = str(tmp_path)
    backup_file = tmp_path / "backup_test_20260101_120000.sql"
    backup_file.write_bytes(b"data")

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "123; TABLE public products\n"
    mock_result.stderr = ""

    with patch(
        "app.services.backup_service.subprocess.run",
        return_value=mock_result,
    ):
        response = client.post(
            "/api/backup/backup_test_20260101_120000.sql/verify",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    assert response.status_code == 200
    data = response.get_json()
    assert data["verified"] is True
    assert data["entries"] == 1


def test_backups_ignorados_por_git():
    import subprocess
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    res = subprocess.run(
        ["git", "-C", str(root), "check-ignore", "backend/backups/x.dump"],
        capture_output=True,
    )
    assert res.returncode == 0


def test_backup_dir_default_outside_repo(app):
    from app.services.backup_service import _get_backup_dir
    from pathlib import Path
    app.config["BACKUP_DIR"] = None
    backup_path = _get_backup_dir()
    repo_root = Path(app.root_path).parent.resolve()
    assert backup_path.is_absolute()
    assert not str(backup_path).startswith(str(repo_root / "backend"))

