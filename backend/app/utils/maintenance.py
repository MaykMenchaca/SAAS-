"""Modo mantenimiento: mientras está activo, la API responde 503 (salvo salud y estado).

La bandera es un archivo en la carpeta de respaldos (así la ven todos los procesos del servidor y
sobrevive a un reinicio) más una copia en memoria. Si el proceso se cae a media restauración, la
bandera caduca sola tras ``MAINTENANCE_MAX_SECONDS`` (2 h por defecto) para no dejar el sistema
bloqueado para siempre.
"""
import json
import threading
import time
from pathlib import Path

from flask import current_app, jsonify, request

FLAG_NAME = ".mantenimiento"
MAINTENANCE_MESSAGE = (
    "El sistema está en mantenimiento (restaurando un respaldo). "
    "Espera unos minutos; las ventas se guardan en la caja y se enviarán después."
)
# Rutas que siguen respondiendo en mantenimiento
EXEMPT_PATHS = frozenset({"/api/health", "/api/backup/restore-status"})

_lock = threading.Lock()
_memory_since: float | None = None


def _flag_file() -> Path:
    configured = current_app.config.get("MAINTENANCE_FLAG_FILE")
    if configured:
        return Path(configured)
    from app.services.backup_service import _get_backup_dir

    return _get_backup_dir() / FLAG_NAME


def _max_seconds() -> int:
    return int(current_app.config.get("MAINTENANCE_MAX_SECONDS", 2 * 60 * 60))


def enter(reason: str = "restauracion") -> None:
    """Activa el modo mantenimiento (memoria + archivo)."""
    global _memory_since
    now = time.time()
    with _lock:
        _memory_since = now
        try:
            _flag_file().write_text(json.dumps({"since": now, "reason": reason}), encoding="utf-8")
        except OSError:
            # La copia en memoria basta en un solo proceso; el archivo solo ayuda entre procesos
            pass


def leave() -> None:
    """Desactiva el modo mantenimiento."""
    global _memory_since
    with _lock:
        _memory_since = None
        try:
            _flag_file().unlink(missing_ok=True)
        except OSError:
            pass


def is_active() -> bool:
    global _memory_since
    now = time.time()
    limit = _max_seconds()
    with _lock:
        if _memory_since is not None:
            if now - _memory_since <= limit:
                return True
            _memory_since = None
    try:
        flag = _flag_file()
        if not flag.exists():
            return False
        try:
            since = float(json.loads(flag.read_text(encoding="utf-8")).get("since", 0))
        except (ValueError, OSError):
            since = flag.stat().st_mtime
        if now - since > limit:
            flag.unlink(missing_ok=True)
            return False
        return True
    except OSError:
        return False


def register_maintenance(app) -> None:
    """Registra el filtro que responde 503 a toda la API mientras dura el mantenimiento."""

    @app.before_request
    def _block_during_maintenance():
        path = request.path
        if request.method == "OPTIONS" or not path.startswith("/api/") or path in EXEMPT_PATHS:
            return None
        if not is_active():
            return None
        response = jsonify({
            "error": MAINTENANCE_MESSAGE,
            "code": "maintenance",
            "maintenance": True,
        })
        response.status_code = 503
        response.headers["Retry-After"] = "30"
        return response
