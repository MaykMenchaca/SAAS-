"""Backup API — create and list database backups."""
from flask import Blueprint, jsonify, request, send_from_directory

from app.services import backup_service, restore_service
from app.services.audit_service import log_action
from flask_jwt_extended import current_user

from app.utils.decorators import require_role

backup_bp = Blueprint("backup", __name__)


@backup_bp.route("/", methods=["GET"])
@require_role("admin")
def list_backups():
    """List all available database backups."""
    return jsonify({"backups": backup_service.list_backups()}), 200


@backup_bp.route("/", methods=["POST"])
@require_role("admin")
def create_backup():
    """Create a new database backup."""
    try:
        result = backup_service.create_backup()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    log_action(
        action="create",
        entity_type="backup",
        details={"filename": result["filename"]},
        commit=True,  # acción sobre archivos, sin transacción de BD que la confirme
    )

    # Las rutas absolutas del servidor (carpeta de respaldos, USB) no salen al cliente (RF-31)
    public = {k: v for k, v in result.items() if k not in ("path", "usb_path")}
    return jsonify(public), 201


@backup_bp.route("/<filename>", methods=["DELETE"])
@require_role("admin")
def delete_backup(filename):
    """Delete a specific backup file."""
    try:
        deleted = backup_service.delete_backup(filename)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if not deleted:
        return jsonify({"error": "Backup no encontrado"}), 404

    log_action(
        action="delete",
        entity_type="backup",
        details={"filename": filename},
        commit=True,  # acción sobre archivos, sin transacción de BD que la confirme
    )

    return jsonify({"message": "Backup eliminado"}), 200


@backup_bp.route("/<filename>/verify", methods=["POST"])
@require_role("admin")
def verify_backup(filename):
    """Verify that a backup file is readable before restore."""
    try:
        result = backup_service.verify_backup(filename)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    log_action(
        action="verify",
        entity_type="backup",
        details={"filename": filename},
        commit=True,  # acción sobre archivos, sin transacción de BD que la confirme
    )

    return jsonify(result), 200


@backup_bp.route("/<filename>/download", methods=["GET"])
@require_role("admin")
def download_backup(filename):
    """Descarga un respaldo. El nombre se valida contra la lista de respaldos (sin rutas)."""
    try:
        filepath = backup_service.resolve_listed_backup(filename)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404

    log_action(
        action="download",
        entity_type="backup",
        details={"filename": filepath.name},
        commit=True,  # acción sobre archivos, sin transacción de BD que la confirme
    )

    return send_from_directory(filepath.parent, filepath.name, as_attachment=True)


@backup_bp.route("/restore-status", methods=["GET"])
def restore_status():
    """Estado de la restauración. Público y sin tocar la base: durante la restauración la base
    se está reemplazando y las sesiones no se pueden validar. Solo expone estado y mensaje."""
    status = restore_service.get_status()
    keys = ("state", "message", "step", "filename", "started_at", "finished_at")
    return jsonify({k: status.get(k) for k in keys}), 200


@backup_bp.route("/<filename>/restore", methods=["POST"])
@require_role("admin")
def restore_backup(filename):
    """Restaura un respaldo (ver ``restore_service``). Exige escribir ``RESTAURAR <archivo>``."""
    body = request.get_json(silent=True) or {}
    if body.get("confirm") != f"RESTAURAR {filename}":
        return jsonify({
            "error": f"Confirmación inválida. Escribe exactamente: RESTAURAR {filename}",
            "code": "confirmation_required",
        }), 400

    actor = {"user_id": current_user.id, "username": current_user.username}
    try:
        status = restore_service.start_restore(filename, actor)
    except (ValueError, FileNotFoundError):
        return jsonify({"error": "El archivo no es un respaldo válido."}), 400
    except restore_service.RestoreBusyError as e:
        return jsonify({"error": str(e)}), 409
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    return jsonify(status), 202
