"""Backup service — pg_dump wrapper for database backups."""
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import current_app


def _get_backup_dir() -> Path:
    """Return the backup directory, creating it if needed."""
    configured = current_app.config.get("BACKUP_DIR") or os.getenv("BACKUP_DIR")
    if configured:
        backup_dir = Path(configured)
        if not backup_dir.is_absolute():
            backup_dir = Path(current_app.root_path).parent / backup_dir
    else:
        program_data = os.getenv("PROGRAMDATA")
        if program_data:
            backup_dir = Path(program_data) / "pos-vrntas" / "backups"
        else:
            backup_dir = Path(current_app.root_path).parents[2] / "pos-vrntas-backups"

    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _get_usb_backup_dir() -> Path | None:
    """Return the optional USB backup directory when it is mounted."""
    configured = current_app.config.get("USB_BACKUP_DIR") or os.getenv("USB_BACKUP_DIR")
    if not configured:
        return None

    usb_dir = Path(configured)
    if not usb_dir.exists() or not usb_dir.is_dir():
        return None

    target_dir = usb_dir / "pos-system-backups"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def _parse_db_url() -> dict:
    """Parse DATABASE_URL into components for pg_dump."""
    url = current_app.config["SQLALCHEMY_DATABASE_URI"]
    parsed = urlparse(url)
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "pos_user",
        "password": parsed.password or "",
        "dbname": parsed.path.lstrip("/"),
    }


def create_backup() -> dict:
    """Create a database backup using pg_dump.

    Returns:
        Dict with filename, path, size, and created_at.

    Raises:
        RuntimeError: If pg_dump fails.
    """
    backup_dir = _get_backup_dir()
    db_info = _parse_db_url()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{db_info['dbname']}_{timestamp}.sql"
    filepath = backup_dir / filename

    env = os.environ.copy()
    if db_info["password"]:
        env["PGPASSWORD"] = db_info["password"]

    cmd = [
        "pg_dump",
        "-h", db_info["host"],
        "-p", db_info["port"],
        "-U", db_info["user"],
        "-F", "c",  # custom format (compressed)
        "-f", str(filepath),
        db_info["dbname"],
    ]

    try:
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "pg_dump no encontrado. Asegurate de que PostgreSQL client tools esten instalados."
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("pg_dump tardo mas de 5 minutos y fue cancelado.")

    if result.returncode != 0:
        raise RuntimeError(f"pg_dump fallo: {result.stderr.strip()}")

    size = filepath.stat().st_size
    usb_copy = copy_backup_to_usb(filepath)

    return {
        "filename": filename,
        "path": str(filepath),
        "size": size,
        "size_bytes": size,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "usb_copied": usb_copy is not None,
        "usb_path": str(usb_copy) if usb_copy else None,
    }


def copy_backup_to_usb(filepath: str | os.PathLike) -> Path | None:
    """Copy a backup to the configured USB directory if it is mounted."""
    source = Path(filepath)
    usb_dir = _get_usb_backup_dir()
    if usb_dir is None:
        return None

    destination = usb_dir / source.name
    shutil.copy2(source, destination)
    return destination


def list_backups() -> list:
    """List existing backup files sorted by date (newest first)."""
    backup_dir = _get_backup_dir()
    backups = []

    for f in sorted(backup_dir.glob("backup_*.sql"), reverse=True):
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "size": stat.st_size,
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat(),
        })

    return backups


def delete_backup(filename: str) -> bool:
    """Delete a backup file by name. Returns True if deleted."""
    filepath = _resolve_backup_path(filename)

    if not filepath.exists():
        return False

    filepath.unlink()
    return True


def verify_backup(filename: str) -> dict:
    """Verify that a backup archive can be read by pg_restore."""
    filepath = _resolve_backup_path(filename)
    if not filepath.exists():
        raise FileNotFoundError("Backup no encontrado")

    cmd = ["pg_restore", "--list", str(filepath)]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "pg_restore no encontrado. Asegurate de que PostgreSQL client tools esten instalados."
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("La verificacion del backup tardo mas de 2 minutos.")

    if result.returncode != 0:
        raise RuntimeError(f"Verificacion fallo: {result.stderr.strip()}")

    entries = [
        line for line in result.stdout.splitlines()
        if line.strip() and not line.lstrip().startswith(";")
    ]

    return {
        "filename": filepath.name,
        "verified": True,
        "entries": len(entries),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def _resolve_backup_path(filename: str) -> Path:
    """Resolve a backup filename while preventing path traversal."""
    backup_dir = _get_backup_dir()
    filepath = backup_dir / filename

    if filepath.parent.resolve() != backup_dir.resolve():
        raise ValueError("Nombre de archivo invalido")

    return filepath
