"""Backup service — pg_dump wrapper for database backups."""
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import click
from flask import current_app
from flask.cli import with_appcontext

from app.utils.timeutil import local_now, to_local


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


def parse_db_url() -> dict:
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


def _get_pg_dump_path() -> str:
    """Return full path to pg_dump executable, autodetecting if needed."""
    configured = current_app.config.get("PG_BIN_DIR") or os.getenv("PG_BIN_DIR")
    if configured:
        exe_path = Path(configured) / "pg_dump.exe"
        if exe_path.exists():
            return str(exe_path)
        plain_path = Path(configured) / "pg_dump"
        if plain_path.exists():
            return str(plain_path)
        return str(Path(configured) / "pg_dump")

    program_files = os.getenv("PROGRAMFILES", r"C:\Program Files")
    pg_dirs = sorted(Path(program_files).glob("PostgreSQL/*/bin"), reverse=True)
    for p in pg_dirs:
        exe = p / "pg_dump.exe"
        if exe.exists():
            return str(exe)

    return "pg_dump"


def _get_pg_restore_path() -> str:
    """Return full path to pg_restore executable, autodetecting if needed."""
    configured = current_app.config.get("PG_BIN_DIR") or os.getenv("PG_BIN_DIR")
    if configured:
        exe_path = Path(configured) / "pg_restore.exe"
        if exe_path.exists():
            return str(exe_path)
        plain_path = Path(configured) / "pg_restore"
        if plain_path.exists():
            return str(plain_path)
        return str(Path(configured) / "pg_restore")

    program_files = os.getenv("PROGRAMFILES", r"C:\Program Files")
    pg_dirs = sorted(Path(program_files).glob("PostgreSQL/*/bin"), reverse=True)
    for p in pg_dirs:
        exe = p / "pg_restore.exe"
        if exe.exists():
            return str(exe)

    return "pg_restore"


def create_backup(prefix: str | None = None) -> dict:
    """Create a database backup using pg_dump.

    Args:
        prefix: si se da, el archivo se llama ``<prefix>-<fecha>.dump`` (p. ej. ``pre-restore``)
            en vez de ``backup_<base>_<fecha>.dump``. Esos archivos no entran a la lista ni a la
            política de retención de los respaldos normales.

    Returns:
        Dict with filename, path, size, and created_at.

    Raises:
        RuntimeError: If pg_dump fails.
    """
    backup_dir = _get_backup_dir()
    db_info = parse_db_url()

    timestamp = local_now().strftime("%Y%m%d_%H%M%S")
    stem = f"{prefix}-{timestamp}" if prefix else f"backup_{db_info['dbname']}_{timestamp}"
    # Dos respaldos en el mismo segundo (dos cierres de caja, doble clic) compartían nombre y un pg_dump
    # escribía encima del otro: el nombre se reserva creando el archivo de forma exclusiva (RF-14)
    filepath = _reserve_backup_file(backup_dir, stem)
    filename = filepath.name

    env = os.environ.copy()
    if db_info["password"]:
        env["PGPASSWORD"] = db_info["password"]

    pg_dump_bin = _get_pg_dump_path()
    cmd = [
        pg_dump_bin,
        "-h", db_info["host"],
        "-p", db_info["port"],
        "-U", db_info["user"],
        "-F", "c",  # custom format (compressed)
        "-f", str(filepath),
    ]
    # Solo para pruebas aisladas: limita el respaldo (y por tanto la restauración) a un esquema.
    only_schema = current_app.config.get("BACKUP_PG_SCHEMA")
    if only_schema:
        cmd += ["-n", only_schema]
    cmd.append(db_info["dbname"])

    try:
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError:
        if filepath.exists():
            filepath.unlink(missing_ok=True)
        raise RuntimeError(
            "pg_dump no encontrado. Asegurate de que PostgreSQL client tools esten instalados."
        )
    except subprocess.TimeoutExpired:
        if filepath.exists():
            filepath.unlink(missing_ok=True)
        raise RuntimeError("pg_dump tardo mas de 5 minutos y fue cancelado.")

    if result.returncode != 0:
        if filepath.exists():
            filepath.unlink(missing_ok=True)
        current_app.logger.error("pg_dump falló: %s", result.stderr.strip())
        raise RuntimeError(f"pg_dump fallo: {_hide_paths(result.stderr.strip(), backup_dir)}")

    size = filepath.stat().st_size
    usb_copy = None
    usb_error = None
    try:
        usb_copy = copy_backup_to_usb(filepath)
    except OSError as e:
        current_app.logger.warning("No se pudo copiar el respaldo a la USB: %s", e)
        usb_error = "No se pudo copiar el respaldo a la USB."

    return {
        "filename": filename,
        "path": str(filepath),
        "size": size,
        "size_bytes": size,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "usb_copied": usb_copy is not None,
        "usb_path": str(usb_copy) if usb_copy else None,
        "usb_error": usb_error,
    }


def _reserve_backup_file(backup_dir: Path, stem: str) -> Path:
    """Crea vacío ``<stem>.dump`` (o ``<stem>-2.dump``, ``-3``…) con O_EXCL: dos hilos o procesos nunca
    reciben el mismo nombre. pg_dump escribe después sobre el archivo reservado (RF-14)."""
    counter = 1
    while True:
        filepath = backup_dir / (f"{stem}.dump" if counter == 1 else f"{stem}-{counter}.dump")
        try:
            fd = os.open(filepath, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            counter += 1
            continue
        os.close(fd)
        return filepath


def _hide_paths(message: str, directory: Path) -> str:
    """Quita del mensaje la ruta absoluta de la carpeta de respaldos; el detalle completo va al log (RF-31)."""
    for variant in sorted({str(directory), str(directory.resolve()), directory.as_posix(),
                           directory.resolve().as_posix()}, key=len, reverse=True):
        for sep in ("\\", "/"):
            message = message.replace(variant + sep, "")
        message = message.replace(variant, "<respaldos>")
    return message


def copy_backup_to_usb(filepath: str | os.PathLike) -> Path | None:
    """Copy a backup to the configured USB directory if it is mounted."""
    source = Path(filepath)
    usb_dir = _get_usb_backup_dir()
    if usb_dir is None:
        return None

    destination = usb_dir / source.name
    try:
        shutil.copy2(source, destination)
    except OSError:
        return None
    return destination


def apply_retention(daily_keep: int = 14, weekly_keep: int = 8) -> dict:
    """Apply retention policy to backups: keep latest `daily_keep` days,
    and 1 per week for up to `weekly_keep` weeks. Delete older ones.
    """
    backup_dir = _get_backup_dir()
    dump_files = sorted(backup_dir.glob("backup_*.dump"), key=lambda f: f.name, reverse=True)
    if not dump_files:
        return {"kept": 0, "deleted": 0}

    files_by_day = {}
    fallback_files = []

    for f in dump_files:
        parts = f.stem.split("_")
        date_str = None
        for part in parts:
            if len(part) == 8 and part.isdigit():
                date_str = part
                break

        if date_str:
            try:
                d = datetime.strptime(date_str, "%Y%m%d").date()
                files_by_day.setdefault(d, []).append(f)
            except ValueError:
                fallback_files.append(f)
        else:
            d = to_local(datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)).date()
            files_by_day.setdefault(d, []).append(f)

    sorted_days = sorted(files_by_day.keys(), reverse=True)

    keep_files = set()
    daily_days = sorted_days[:daily_keep]
    for d in daily_days:
        for f in files_by_day[d]:
            keep_files.add(f)

    older_days = sorted_days[daily_keep:]
    weeks_kept = {}
    for d in older_days:
        iso_year, iso_week, _ = d.isocalendar()
        week_key = (iso_year, iso_week)
        if week_key not in weeks_kept and len(weeks_kept) < weekly_keep:
            weeks_kept[week_key] = files_by_day[d][0]
            keep_files.add(files_by_day[d][0])

    deleted_count = 0
    for f in dump_files:
        if f not in keep_files and f not in fallback_files:
            try:
                f.unlink(missing_ok=True)
                deleted_count += 1
            except OSError:
                pass

    return {"kept": len(keep_files), "deleted": deleted_count}


def list_backups() -> list:
    """List existing backup files sorted by date (newest first)."""
    backup_dir = _get_backup_dir()
    backups = []
    seen_names = set()

    all_files = []
    for pattern in ("backup_*.dump", "backup_*.sql"):
        all_files.extend(backup_dir.glob(pattern))

    all_files = sorted(all_files, key=lambda f: f.name, reverse=True)

    for f in all_files:
        if f.name in seen_names:
            continue
        seen_names.add(f.name)
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
    """Delete a backup file by name. Returns True if deleted.

    Solo respaldos de la lista: no se pueden borrar los ``pre-restore-*`` (la red de seguridad de una
    restauración), el estado de la restauración ni otros archivos de la carpeta (RF-26).

    Raises:
        ValueError: nombre con rutas, ``.`` o ``..`` (RF-31).
    """
    try:
        filepath = resolve_listed_backup(filename)
    except FileNotFoundError:
        return False
    if not filepath.is_file():
        return False

    filepath.unlink()
    return True


def verify_backup(filename: str) -> dict:
    """Verify that a backup archive can be read by pg_restore.

    Solo respaldos de la lista (RF-26); ``..`` y rutas dan ValueError (RF-31).
    """
    filepath = resolve_listed_backup(filename)
    if not filepath.is_file():
        raise FileNotFoundError("Backup no encontrado")

    cmd = [_get_pg_restore_path(), "--list", str(filepath)]

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
        current_app.logger.warning("Verificación de %s falló: %s", filepath.name, result.stderr.strip())
        raise RuntimeError(f"Verificacion fallo: {_hide_paths(result.stderr.strip(), filepath.parent)}")

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


def resolve_listed_backup(filename: str) -> Path:
    """Devuelve la ruta de un respaldo, validando el nombre contra la lista real.

    Raises:
        ValueError: el nombre trae rutas o caracteres de directorio.
        FileNotFoundError: el nombre no corresponde a un respaldo listado.
    """
    if (
        not filename
        or filename != Path(filename).name
        or "/" in filename
        or "\\" in filename
        or filename in (".", "..")
    ):
        raise ValueError("Nombre de archivo invalido")
    if filename not in {b["filename"] for b in list_backups()}:
        raise FileNotFoundError("Backup no encontrado")
    return _resolve_backup_path(filename)


def _resolve_backup_path(filename: str) -> Path:
    """Resolve a backup filename while preventing path traversal."""
    backup_dir = _get_backup_dir()
    # "dir/.." tiene parent == dir y pasaba la revisión; luego unlink fallaba con 500 (RF-31)
    if not filename or filename in (".", ".."):
        raise ValueError("Nombre de archivo invalido")
    filepath = backup_dir / filename

    if filepath.parent.resolve() != backup_dir.resolve():
        raise ValueError("Nombre de archivo invalido")

    return filepath


@click.command("backup")
@click.option("--retention/--no-retention", default=True, help="Aplicar política de retención.")
@with_appcontext
def backup_command(retention):
    """Crear un respaldo de la base de datos."""
    click.echo("Iniciando respaldo de base de datos...")
    try:
        res = create_backup()
        click.echo(f"Respaldo creado con éxito: {res['filename']} ({res['size_bytes']} bytes)")
        if res.get("usb_copied"):
            click.echo(f"Copia en USB creada: {res.get('usb_path')}")
        elif res.get("usb_error"):
            click.echo(f"Advertencia USB: {res.get('usb_error')}", err=True)

        if retention:
            ret = apply_retention()
            click.echo(f"Retención aplicada: {ret['kept']} conservados, {ret['deleted']} eliminados.")
    except Exception as e:
        click.echo(f"Error al crear el respaldo: {e}", err=True)
        raise SystemExit(1)

