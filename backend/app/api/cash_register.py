"""Cash Register API — open/close sessions and list them."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models.sale import CashRegister, CashRegisterSession
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

    from datetime import datetime, timezone
    from decimal import Decimal

    session.closing_amount = data["closing_amount"]
    session.close_notes = data.get("close_notes")
    session.status = "cerrada"
    session.closed_at = datetime.now(timezone.utc)

    # Calculate expected cash: opening + cash sales during session
    # For now, expected_cash = opening_amount (will be enhanced later)
    session.expected_cash = session.opening_amount
    session.difference = Decimal(str(data["closing_amount"])) - session.expected_cash

    db.session.commit()

    return jsonify(session_schema.dump(session)), 200


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
