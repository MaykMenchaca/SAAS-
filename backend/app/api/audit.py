"""Audit log API — query audit trail entries."""
from app.utils.timeutil import local_day_bounds, parse_local_date

from flask import Blueprint, jsonify, request

from app.schemas.audit import AuditLogSchema
from app.services.audit_service import get_logs
from app.utils.decorators import require_role

audit_bp = Blueprint("audit", __name__)
_log_schema = AuditLogSchema(many=True)


@audit_bp.route("/", methods=["GET"])
@require_role("admin")
def list_audit_logs():
    """List audit log entries with optional filters.

    Query params:
        page, per_page: Pagination (default 1, 50).
        user_id: Filter by user.
        action: Filter by action type (login, create, update, etc.).
        entity_type: Filter by entity (sale, product, user, etc.).
        entity_id: Filter by specific entity ID.
        from: Start date (YYYY-MM-DD).
        to: End date (YYYY-MM-DD).
    """
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 50, type=int), 100)

    user_id = request.args.get("user_id", type=int)
    action = request.args.get("action")
    entity_type = request.args.get("entity_type")
    entity_id = request.args.get("entity_id", type=int)

    date_from = None
    date_to = None
    raw_from = request.args.get("from")
    raw_to = request.args.get("to")

    # Días en la zona horaria de la tienda, intervalo [inicio, fin) (OPS-11, H-21)
    if raw_from:
        date_from, _ = local_day_bounds(parse_local_date(raw_from))
    if raw_to:
        _, date_to = local_day_bounds(parse_local_date(raw_to))

    result = get_logs(
        page=page,
        per_page=per_page,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
    )

    return jsonify({
        "items": _log_schema.dump(result["items"]),
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
        "pages": result["pages"],
    }), 200
