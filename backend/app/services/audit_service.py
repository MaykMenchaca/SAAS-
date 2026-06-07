"""Service for recording and querying audit log entries."""
from datetime import datetime, timezone

from flask import request as flask_request
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from app.extensions import db
from app.models.audit import AuditLog


def log_action(
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    details: dict | None = None,
    user_id: int | None = None,
    username: str | None = None,
):
    """Record an audit log entry.

    If user_id/username are not provided, they are extracted from the
    current JWT (if present).
    """
    if user_id is None:
        try:
            verify_jwt_in_request(optional=True)
            identity = get_jwt_identity()
            if identity:
                user_id = int(identity)
                claims = get_jwt()
                username = claims.get("username")
        except Exception:
            pass

    ip_address = None
    try:
        ip_address = flask_request.remote_addr
    except RuntimeError:
        pass

    entry = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip_address,
    )
    db.session.add(entry)
    db.session.flush()
    return entry


def get_logs(
    page: int = 1,
    per_page: int = 50,
    user_id: int | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    """Query audit logs with optional filters, paginated."""
    query = AuditLog.query

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(AuditLog.entity_id == entity_id)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    query = query.order_by(AuditLog.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        "items": pagination.items,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }
