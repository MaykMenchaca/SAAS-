"""Restauración de un respaldo desde la web (subfase 7.4).

Protocolo (cada paso es obligatorio):
  1. Se valida el nombre contra la lista de respaldos y se verifica que pg_restore lo pueda leer.
  2. Respaldo previo automático ``pre-restore-<fecha>.dump``; si falla, se aborta sin tocar nada.
  3. Modo mantenimiento (toda la API responde 503 salvo /api/health y el estado).
  4. La restauración corre en un hilo; el frontend consulta ``GET /api/backup/restore-status``.
  5. Se cierran las demás conexiones de la base y se corre
     ``pg_restore --clean --if-exists --single-transaction --exit-on-error``.
  6. ``flask db upgrade`` por si el respaldo es de una versión anterior.
  7. Se revocan todas las sesiones, se audita (en la base ya restaurada) y se sale de mantenimiento.
  8. Si cualquier paso falla, se restaura el respaldo previo, se sale de mantenimiento y el error
     queda en el estado.
"""
import json
import os
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import current_app

from app.extensions import db
from app.services import backup_service
from app.services.audit_service import log_action
from app.utils import maintenance

RESTORE_TIMEOUT_SECONDS = 30 * 60
STATUS_FILE = ".restore-status.json"
STALE_AFTER_SECONDS = 2 * 60 * 60

STATE_IDLE = "inactivo"
STATE_RUNNING = "en_curso"
STATE_OK = "ok"
STATE_ERROR = "error"

_lock = threading.Lock()
_status: dict | None = None
_thread: threading.Thread | None = None


class RestoreBusyError(RuntimeError):
    """Ya hay una restauración en curso."""


# ── Estado (memoria + archivo, sin tocar la base: la base se está reemplazando) ──────────────


def _status_path() -> Path:
    return backup_service._get_backup_dir() / STATUS_FILE


def _write_status(**changes) -> dict:
    global _status
    with _lock:
        current = dict(_status or {"state": STATE_IDLE, "message": "", "step": ""})
        current.update(changes)
        _status = current
        try:
            _status_path().write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass
        return dict(current)


def get_status() -> dict:
    """Estado de la última restauración. No consulta la base de datos."""
    with _lock:
        if _status is not None:
            return dict(_status)
    try:
        return json.loads(_status_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"state": STATE_IDLE, "message": "", "step": ""}


def _is_running() -> bool:
    status = get_status()
    if status.get("state") != STATE_RUNNING:
        return False
    started = status.get("started_ts") or 0
    return time.time() - started < STALE_AFTER_SECONDS


def reset_state_for_tests() -> None:
    """Limpia el estado en memoria (solo pruebas)."""
    global _status, _thread
    with _lock:
        _status = None
        _thread = None


def wait_until_finished(timeout: float = 120.0) -> bool:
    """Espera al hilo de restauración. Devuelve True si terminó."""
    thread = _thread
    if thread is None:
        return True
    thread.join(timeout)
    return not thread.is_alive()


# ── Pasos de bajo nivel ───────────────────────────────────────────────────────────────────


def _terminate_other_connections() -> int:
    """Cierra las demás conexiones del mismo usuario a esta base (pg_terminate_backend)."""
    if not current_app.config.get("RESTORE_TERMINATE_CONNECTIONS", True):
        return 0
    result = db.session.execute(
        db.text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() AND usename = current_user "
            "AND pid <> pg_backend_pid()"
        )
    )
    closed = len(result.fetchall())
    db.session.commit()
    return closed


def _pg_restore(path: Path) -> None:
    """Restaura un archivo .dump con las banderas de seguridad. Lanza RuntimeError si falla."""
    info = backup_service.parse_db_url()
    env = os.environ.copy()
    if info["password"]:
        env["PGPASSWORD"] = info["password"]
    cmd = [
        backup_service._get_pg_restore_path(),
        "-h", info["host"],
        "-p", info["port"],
        "-U", info["user"],
        "-d", info["dbname"],
        "--clean",
        "--if-exists",
        "--single-transaction",
        "--exit-on-error",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=RESTORE_TIMEOUT_SECONDS)
    except FileNotFoundError:
        raise RuntimeError("pg_restore no encontrado. Revisa que las herramientas de PostgreSQL estén instaladas.")
    except subprocess.TimeoutExpired:
        raise RuntimeError("pg_restore tardó más de 30 minutos y fue cancelado.")
    if result.returncode != 0:
        detail = (result.stderr or "").strip().splitlines()
        raise RuntimeError(f"pg_restore falló: {' | '.join(detail[-3:])[:400]}")


def _restore_file(path: Path) -> None:
    """Libera la base (pool y otras conexiones) y restaura el archivo."""
    db.session.remove()
    db.engine.dispose()
    _terminate_other_connections()
    db.session.remove()
    db.engine.dispose()
    try:
        _pg_restore(path)
    finally:
        # Las conexiones viejas apuntan a objetos que ya no existen
        db.session.remove()
        db.engine.dispose()


def _run_migrations() -> None:
    """``flask db upgrade``: lleva un respaldo de una versión anterior al esquema actual."""
    from flask_migrate import upgrade

    upgrade(directory=str(Path(current_app.root_path).parent / "migrations"))


def _token_versions() -> dict[int, int]:
    """token_version de cada usuario ANTES de restaurar (los tokens vigentes llevan esas versiones)."""
    from app.models.user import User

    versions = {uid: int(version or 0) for uid, version in db.session.query(User.id, User.token_version).all()}
    db.session.rollback()
    return versions


def _revoke_all_sessions(previous: dict[int, int]) -> None:
    """Todas las sesiones y cajas deben volver a entrar.

    Sumar 1 a la versión RESTAURADA no basta (RF-05): un token emitido después del respaldo lleva la versión
    del respaldo + 1 y volvía a coincidir. La nueva versión supera tanto la restaurada como la que había justo
    antes de restaurar, así que ningún token emitido antes de la restauración es válido.
    """
    from app.models.user import User

    for user in User.query.all():
        user.token_version = max(int(user.token_version or 0), previous.get(user.id, 0)) + 1
    db.session.commit()


# ── Orquestación ──────────────────────────────────────────────────────────────────────────


def _audit(actor: dict, action: str, details: dict) -> None:
    """Audita en la base restaurada; el usuario puede no existir ahí, entonces solo queda el nombre."""
    from app.models.user import User

    user_id = actor.get("user_id")
    if user_id is not None and db.session.get(User, user_id) is None:
        user_id = None
    log_action(
        action=action,
        entity_type="backup",
        user_id=user_id,
        username=actor.get("username"),
        details=details,
        commit=True,
    )


def _execute(app, filename: str, backup_path: Path, pre_path: Path, actor: dict) -> None:
    with app.app_context():
        error: str | None = None
        rolled_back: bool | None = None
        try:
            # Ya en mantenimiento: nadie puede iniciar sesión entre esta foto y la restauración
            previous_versions = _token_versions()
            _write_status(step="Restaurando la base de datos...")
            _restore_file(backup_path)
            _write_status(step="Actualizando el esquema...")
            _run_migrations()
            _write_status(step="Cerrando todas las sesiones...")
            _revoke_all_sessions(previous_versions)
        except Exception as exc:  # noqa: BLE001 - cualquier fallo dispara la reversión
            error = str(exc) or exc.__class__.__name__
            _write_status(step="Falló la restauración; recuperando el estado anterior...")
            try:
                db.session.rollback()
            except Exception:  # noqa: BLE001
                pass
            try:
                _restore_file(pre_path)
                rolled_back = True
            except Exception as rollback_exc:  # noqa: BLE001
                rolled_back = False
                error = f"{error} | Además falló recuperar el respaldo previo: {rollback_exc}"

        try:
            if error is None:
                _audit(actor, "restore", {"filename": filename, "result": "ok", "pre_restore": pre_path.name})
            elif rolled_back:
                _audit(actor, "restore", {"filename": filename, "result": "error", "error": error[:300]})
        except Exception:  # noqa: BLE001 - la auditoría no debe impedir salir de mantenimiento
            current_app.logger.exception("No se pudo auditar la restauración")
        finally:
            maintenance.leave()

        finished = datetime.now(timezone.utc).isoformat()
        if error is None:
            _write_status(
                state=STATE_OK,
                step="",
                finished_at=finished,
                message="Respaldo restaurado. Todas las sesiones se cerraron; vuelve a iniciar sesión.",
            )
        elif rolled_back:
            _write_status(
                state=STATE_ERROR,
                step="",
                finished_at=finished,
                message=f"No se pudo restaurar el respaldo: {error}. Se recuperó el estado anterior.",
            )
        else:
            _write_status(
                state=STATE_ERROR,
                step="",
                finished_at=finished,
                message=(
                    f"No se pudo restaurar el respaldo y tampoco recuperar el estado anterior: {error}. "
                    f"Restaura manualmente {pre_path.name} con restore-backup.ps1."
                ),
            )


def start_restore(filename: str, actor: dict) -> dict:
    """Valida, respalda lo actual, activa el mantenimiento y lanza la restauración en un hilo.

    Raises:
        ValueError: nombre con rutas.
        FileNotFoundError: no es un respaldo de la lista.
        RestoreBusyError: ya hay una restauración en curso.
        RuntimeError: el archivo no se puede leer o falló el respaldo previo (no se tocó nada).
    """
    global _thread
    backup_path = backup_service.resolve_listed_backup(filename)
    if _is_running():
        raise RestoreBusyError("Ya hay una restauración en curso.")

    # El archivo debe poder leerse antes de tocar nada
    backup_service.verify_backup(filename)

    # Respaldo previo: si falla, no se hace nada más
    try:
        pre = backup_service.create_backup(prefix="pre-restore")
    except RuntimeError as exc:
        raise RuntimeError(f"No se pudo crear el respaldo previo; no se restauró nada. {exc}") from exc
    pre_path = Path(pre["path"])

    maintenance.enter("restauracion")
    _write_status(
        state=STATE_RUNNING,
        step="Preparando la restauración...",
        message="Restauración en curso. No cierres esta ventana.",
        filename=filename,
        pre_restore_file=pre_path.name,
        started_at=datetime.now(timezone.utc).isoformat(),
        started_ts=time.time(),
        finished_at=None,
    )

    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_execute,
        args=(app, filename, backup_path, pre_path, actor),
        name="restore-backup",
        daemon=False,
    )
    _thread = thread
    thread.start()
    return get_status()
