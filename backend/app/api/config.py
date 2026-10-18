"""System configuration API — read and update app settings."""
from flask import Blueprint, jsonify, request

from app.services import config_service
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
    # Configuración guarda company_*; business_* y los nombres sueltos quedan como respaldo de
    # instalaciones anteriores. Antes se leía business_* primero y dirección, teléfono y RFC salían vacíos (RF-43)
    company_name = config_service.first_configured(
        "company_name", "business_name", default=config_service.get("company_name") or "POS Retail VRNTAS"
    )
    subtitle = config_service.get("company_subtitle") or "VRNTAS POS"
    logo_icon = config_service.get("company_logo_icon") or "ShoppingCart"
    logo_color = config_service.get("company_logo_color") or "primary"
    rfc = config_service.first_configured("company_rfc", "business_rfc", "rfc")
    address = config_service.first_configured("company_address", "business_address", "address")
    phone = config_service.first_configured("company_phone", "business_phone", "phone")
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
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "No se proporcionaron valores"}), 400

    # set_bulk valida cada clave (RF-06) y audita dentro de su transacción
    try:
        result = config_service.set_bulk(data)
    except config_service.ConfigValidationError as exc:
        return jsonify({"error": str(exc), "details": exc.details}), 400
    return jsonify(result), 200
