"""Backup API — create and list database backups."""
from flask import Blueprint, jsonify

from app.services import backup_service
from app.services.audit_service import log_action
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

    return jsonify(result), 201


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
