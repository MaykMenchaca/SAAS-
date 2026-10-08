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


@config_bp.route("/branding", methods=["GET"])
def get_branding():
    """Get public business branding information."""
    company_name = config_service.get("business_name") or config_service.get("company_name") or "POS Retail VRNTAS"
    subtitle = config_service.get("company_subtitle") or "VRNTAS POS"
    logo_icon = config_service.get("company_logo_icon") or "ShoppingCart"
    logo_color = config_service.get("company_logo_color") or "primary"
    rfc = config_service.get("business_rfc") or config_service.get("rfc") or ""
    address = config_service.get("business_address") or config_service.get("address") or ""
    phone = config_service.get("business_phone") or config_service.get("phone") or ""
    logo_url = config_service.get("logo_url") or ""
    return jsonify({
        "business_name": company_name,
        "company_name": company_name,
        "company_subtitle": subtitle,
        "company_logo_icon": logo_icon,
        "company_logo_color": logo_color,
        "business_rfc": rfc,
        "business_address": address,
        "business_phone": phone,
        "logo_url": logo_url,
    }), 200


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
