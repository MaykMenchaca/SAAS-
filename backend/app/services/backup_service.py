"""Backup service — pg_dump wrapper for database backups."""
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import current_app


def _get_backup_dir() -> Path:
    """Return the backup directory, creating it if needed."""
    backup_dir = Path(
        current_app.config.get("BACKUP_DIR", "backups")
    )
    if not backup_dir.is_absolute():
        backup_dir = Path(current_app.root_path).parent / backup_dir
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


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

    return {
        "filename": filename,
        "path": str(filepath),
        "size_bytes": size,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def list_backups() -> list:
    """List existing backup files sorted by date (newest first)."""
    backup_dir = _get_backup_dir()
    backups = []

    for f in sorted(backup_dir.glob("backup_*.sql"), reverse=True):
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat(),
        })

    return backups


def delete_backup(filename: str) -> bool:
    """Delete a backup file by name. Returns True if deleted."""
    backup_dir = _get_backup_dir()
    filepath = backup_dir / filename

    # Prevent path traversal
    if filepath.parent.resolve() != backup_dir.resolve():
        raise ValueError("Nombre de archivo invalido")

    if not filepath.exists():
        return False

    filepath.unlink()
    return True
