"""Cash Register API — open/close sessions, list, and cash cut summary."""
from decimal import Decimal

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func

from app.extensions import db
from app.models.sale import CashRegister, CashRegisterSession, Payment, Sale
from app.models.user import User
from app.schemas.sale import (
    CashRegisterSessionCloseSchema,
    CashRegisterSessionOpenSchema,
    CashRegisterSessionSchema,
)
from app.utils.decorators import require_permission

cash_register_bp = Blueprint("cash_register", __name__)

open_schema = CashRegisterSessionOpenSchema()
close_schema = CashRegisterSessionCloseSchema()
session_schema = CashRegisterSessionSchema()
sessions_schema = CashRegisterSessionSchema(many=True)


@cash_register_bp.route("/", methods=["GET"])
@require_permission("caja:ver")
def list_registers():
    """List all active cash registers."""
    registers = CashRegister.query.filter_by(is_active=True).order_by(CashRegister.name).all()
    return jsonify([
        {"id": r.id, "name": r.name, "is_active": r.is_active}
        for r in registers
    ]), 200


@cash_register_bp.route("/open", methods=["POST"])
@require_permission("caja:abrir")
def open_session():
    """Open a new cash register session."""
    data = open_schema.load(request.get_json(silent=True) or {})

    register = db.session.get(CashRegister, data["cash_register_id"])
    if not register:
        return jsonify({"error": "Caja registradora no encontrada"}), 404

    # Check if the register already has an open session
    existing = CashRegisterSession.query.filter_by(
        cash_register_id=register.id, status="abierta"
    ).first()
    if existing:
        return jsonify({"error": "Esta caja ya tiene una sesión abierta"}), 400

    user_id = int(get_jwt_identity())

    session = CashRegisterSession(
        cash_register_id=register.id,
        user_id=user_id,
        opening_amount=data["opening_amount"],
        status="abierta",
    )
    db.session.add(session)
    db.session.commit()

    return jsonify(session_schema.dump(session)), 201


@cash_register_bp.route("/<int:session_id>/close", methods=["POST"])
@require_permission("caja:cerrar")
def close_session(session_id):
    """Close an open cash register session."""
    data = close_schema.load(request.get_json(silent=True) or {})

    session = db.session.get(CashRegisterSession, session_id)
    if not session:
        return jsonify({"error": "Sesión no encontrada"}), 404

    if session.status != "abierta":
        return jsonify({"error": "La sesión ya está cerrada"}), 400

    user_id = int(get_jwt_identity())
    if session.user_id != user_id:
        user = db.session.get(User, user_id)
        has_supervise = (
            user is not None
            and (user.role_name == "admin" or "caja:supervisar" in user.permissions)
        )
        if not has_supervise:
            return jsonify({"error": "No tienes permiso para cerrar la sesión de caja de otro usuario"}), 403

    from datetime import datetime, timezone

    # Calculate expected cash: opening + net cash payments from completed sales
    cash_payments = (
        db.session.query(func.coalesce(func.sum(Payment.amount - Payment.change_amount), 0))
        .join(Sale, Sale.id == Payment.sale_id)
        .filter(
            Sale.session_id == session_id,
            Sale.status == "completada",
            Payment.method == "efectivo",
        )
        .scalar()
    )
    expected_cash = session.opening_amount + Decimal(str(cash_payments))

    session.closing_amount = data["closing_amount"]
    session.close_notes = data.get("close_notes")
    session.status = "cerrada"
    session.closed_at = datetime.now(timezone.utc)
    session.expected_cash = expected_cash
    session.difference = Decimal(str(data["closing_amount"])) - expected_cash

    db.session.commit()

    # Trigger automatic backup on session close (Fase 4)
    try:
        from app.services.backup_service import create_backup
        create_backup()
    except Exception as e:
        # Do not block the session closure response if pg_dump is missing or fails
        from flask import current_app
        current_app.logger.error(f"[BACKUP ERROR] Error creating automated backup on session close: {e}")

    return jsonify(session_schema.dump(session)), 200


@cash_register_bp.route("/<int:session_id>/summary", methods=["GET"])
@require_permission("caja:ver")
def session_summary(session_id):
    """Get a cash cut summary for a session: sales count, totals by payment method."""
    session = db.session.get(CashRegisterSession, session_id)
    if not session:
        return jsonify({"error": "Sesión no encontrada"}), 404

    # Count sales by status
    sales_completed = Sale.query.filter_by(session_id=session_id, status="completada").count()
    sales_cancelled = Sale.query.filter_by(session_id=session_id, status="cancelada").count()

    # Total by payment method (only completed sales)
    payment_totals = (
        db.session.query(
            Payment.method,
            func.sum(Payment.amount).label("total"),
            func.sum(Payment.change_amount).label("change_total"),
        )
        .join(Sale, Sale.id == Payment.sale_id)
        .filter(Sale.session_id == session_id, Sale.status == "completada")
        .group_by(Payment.method)
        .all()
    )

    methods = {}
    for method, total, change in payment_totals:
        net = Decimal(str(total)) - Decimal(str(change or 0))
        methods[method] = str(net.quantize(Decimal("0.01")))

    # Grand total of completed sales
    grand_total = (
        db.session.query(func.coalesce(func.sum(Sale.total), 0))
        .filter(Sale.session_id == session_id, Sale.status == "completada")
        .scalar()
    )

    return jsonify({
        "session_id": session_id,
        "opening_amount": str(session.opening_amount),
        "closing_amount": str(session.closing_amount) if session.closing_amount is not None else None,
        "expected_cash": str(session.expected_cash) if session.expected_cash is not None else None,
        "difference": str(session.difference) if session.difference is not None else None,
        "status": session.status,
        "sales_completed": sales_completed,
        "sales_cancelled": sales_cancelled,
        "grand_total": str(Decimal(str(grand_total)).quantize(Decimal("0.01"))),
        "payment_methods": methods,
    }), 200


@cash_register_bp.route("/sessions", methods=["GET"])
@require_permission("caja:ver")
def list_sessions():
    """List all cash register sessions."""
    sessions = (
        CashRegisterSession.query
        .order_by(CashRegisterSession.opened_at.desc())
        .all()
    )
    return jsonify(sessions_schema.dump(sessions)), 200
