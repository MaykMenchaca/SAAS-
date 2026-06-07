"""System configuration API — read and update app settings."""
from flask import Blueprint, jsonify, request

from app.services import config_service
from app.services.audit_service import log_action
from app.utils.decorators import require_role

config_bp = Blueprint("config", __name__)


@config_bp.route("/", methods=["GET"])
@require_role("admin")
def get_config():
    """Get all system configuration values."""
    return jsonify(config_service.get_all()), 200


@config_bp.route("/<key>", methods=["GET"])
@require_role("admin")
def get_config_key(key):
    """Get a single configuration value."""
    value = config_service.get(key)
    if value is None:
        return jsonify({"error": "Configuracion no encontrada"}), 404
    return jsonify({"key": key, "value": value}), 200


@config_bp.route("/", methods=["PUT"])
@require_role("admin")
def update_config():
    """Update one or more configuration values.

    Body: JSON object with key-value pairs to set.
    Example: {"company_name": "Ferreteria Lopez", "default_tax_rate": "16.00"}
    """
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "No se proporcionaron valores"}), 400

    result = config_service.set_bulk(data)

    log_action(
        action="update",
        entity_type="config",
        details={"updated_keys": list(data.keys())},
    )

    return jsonify(result), 200
