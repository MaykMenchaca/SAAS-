"""Cash Register API — open/close sessions, list, and cash cut summary."""
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.sale import CashRegister, CashRegisterSession, Payment, Sale, SaleReturn
from app.models.user import User
from app.schemas.sale import (
    CashRegisterSessionCloseSchema,
    CashRegisterSessionOpenSchema,
    CashRegisterSessionSchema,
)
from app.services.printer_service import PrinterService
from app.utils.decorators import require_permission, require_role
from app.utils.pagination import paginate

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
    return jsonify([_register_dict(r) for r in registers]), 200


def _register_dict(register: CashRegister) -> dict:
    return {
        "id": register.id,
        "name": register.name,
        "is_active": register.is_active,
        "printer_path": register.printer_path,
        "printer_codepage": register.printer_codepage,
        "print_via_agent": register.print_via_agent,
        "agent_configured": bool(register.agent_key_hash),
        "agent_last_seen_at": register.agent_last_seen_at.isoformat() if register.agent_last_seen_at else None,
    }


def _validate_register_name(raw, exclude_id: int | None = None) -> str:
    """Nombre obligatorio, máximo 50 caracteres y sin repetir (sin distinguir mayúsculas) entre las cajas."""
    name = (raw or "").strip() if isinstance(raw, str) else ""
    if not name or len(name) > 50:
        raise ValueError("El nombre de la caja es obligatorio (máximo 50 caracteres)")
    query = CashRegister.query.filter(db.func.lower(CashRegister.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(CashRegister.id != exclude_id)
    if query.first():
        raise ValueError(f"Ya existe una caja llamada «{name}»")
    return name


@cash_register_bp.route("/registers", methods=["POST"])
@require_role("admin")
def create_register():
    """Da de alta una caja registradora (solo admin). Antes solo existía la "Caja 1" de la siembra (RF-09)."""
    data = request.get_json(silent=True) or {}
    try:
        name = _validate_register_name(data.get("name"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    register = CashRegister(name=name)
    db.session.add(register)
    db.session.flush()

    from app.services.audit_service import log_action
    log_action(
        action="crear",
        entity_type="cash_register",
        entity_id=register.id,
        new_value=_register_dict(register),
        user_id=int(get_jwt_identity()),
    )
    db.session.commit()
    return jsonify(_register_dict(register)), 201


@cash_register_bp.route("/registers/<int:register_id>", methods=["PATCH"])
@require_role("admin")
def update_register(register_id):
    """Configura la impresora de tickets de una caja (solo admin)."""
    register = db.session.get(CashRegister, register_id)
    if not register:
        return jsonify({"error": "Caja registradora no encontrada"}), 404

    data = request.get_json(silent=True) or {}
    before = _register_dict(register)
    try:
        if "printer_path" in data:
            raw_path = (data.get("printer_path") or "").strip()
            register.printer_path = PrinterService.validate_target(raw_path) if raw_path else None
        if "printer_codepage" in data:
            register.printer_codepage = PrinterService.validate_codepage(data.get("printer_codepage"))
        if "print_via_agent" in data:
            register.print_via_agent = bool(data.get("print_via_agent"))
        if "name" in data:
            register.name = _validate_register_name(data.get("name"), exclude_id=register.id)
    except ValueError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400

    from app.services.audit_service import log_action
    log_action(
        action="update",
        entity_type="cash_register",
        entity_id=register.id,
        previous_value=before,
        new_value=_register_dict(register),
        user_id=int(get_jwt_identity()),
    )
    db.session.commit()
    return jsonify(_register_dict(register)), 200


def _find_open_session(register_id: int) -> CashRegisterSession | None:
    return CashRegisterSession.query.filter_by(cash_register_id=register_id, status="abierta").first()


@cash_register_bp.route("/registers/<int:register_id>/agent-key", methods=["POST"])
@require_role("admin")
def create_agent_key(register_id):
    """Genera (o reemplaza) la clave del agente de impresión de la caja. Se muestra una sola vez."""
    register = db.session.get(CashRegister, register_id)
    if not register:
        return jsonify({"error": "Caja registradora no encontrada"}), 404

    from app.services import print_queue_service
    from app.services.audit_service import log_action

    key = print_queue_service.generate_agent_key(register)
    log_action(
        action="generar_clave_agente",
        entity_type="cash_register",
        entity_id=register.id,
        details={"name": register.name},
        user_id=int(get_jwt_identity()),
    )
    db.session.commit()
    return jsonify({"agent_key": key, "register": _register_dict(register)}), 201


@cash_register_bp.route("/open", methods=["POST"])
@require_permission("caja:abrir")
def open_session():
    """Open a new cash register session."""
    data = open_schema.load(request.get_json(silent=True) or {})

    register = db.session.get(CashRegister, data["cash_register_id"])
    if not register:
        return jsonify({"error": "Caja registradora no encontrada"}), 404

    # Verificación amable; el índice único uq_cash_session_open cubre la carrera entre dos aperturas
    if _find_open_session(register.id):
        return jsonify({"error": "Esta caja ya tiene una sesión abierta"}), 400

    user_id = int(get_jwt_identity())

    session = CashRegisterSession(
        cash_register_id=register.id,
        user_id=user_id,
        opening_amount=data["opening_amount"],
        status="abierta",
    )
    db.session.add(session)
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Esta caja ya tiene una sesión abierta"}), 400

    from app.services.audit_service import log_action
    log_action(
        action="open",
        entity_type="cash_register_session",
        entity_id=session.id,
        details={
            "cash_register_id": register.id,
            "cash_register_name": register.name,
            "opening_amount": str(session.opening_amount),
        },
        user_id=user_id,
    )

    db.session.commit()

    return jsonify(session_schema.dump(session)), 201


@cash_register_bp.route("/<int:session_id>/close", methods=["POST"])
@require_permission("caja:cerrar")
def close_session(session_id):
    """Close an open cash register session."""
    data = close_schema.load(request.get_json(silent=True) or {})

    # Bloqueo de la sesión: una venta concurrente espera al cierre y luego ve la caja cerrada (H-31)
    session = (
        db.session.query(CashRegisterSession)
        .filter_by(id=session_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
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

    # Calculate expected cash: opening + net cash payments from completed/returned sales - session cash refunds (H-08)
    cash_payments = (
        db.session.query(func.coalesce(func.sum(Payment.amount - Payment.change_amount), 0))
        .join(Sale, Sale.id == Payment.sale_id)
        .filter(
            Sale.session_id == session_id,
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Payment.method == "efectivo",
        )
        .scalar()
    )
    cash_refunds = (
        db.session.query(func.coalesce(func.sum(SaleReturn.refund_total), 0))
        .filter(
            SaleReturn.session_id == session_id,
            SaleReturn.refund_method == "efectivo",
        )
        .scalar()
    )
    expected_cash = session.opening_amount + Decimal(str(cash_payments)) - Decimal(str(cash_refunds))

    session.closing_amount = data["closing_amount"]
    session.close_notes = data.get("close_notes")
    session.status = "cerrada"
    session.closed_at = datetime.now(timezone.utc)
    session.expected_cash = expected_cash
    session.difference = Decimal(str(data["closing_amount"])) - expected_cash

    from app.services.audit_service import log_action
    log_action(
        action="close",
        entity_type="cash_register_session",
        entity_id=session.id,
        details={
            "closing_amount": str(session.closing_amount),
            "expected_cash": str(session.expected_cash),
            "difference": str(session.difference),
            "close_notes": session.close_notes,
        },
        user_id=user_id,
    )

    db.session.commit()

    # Trigger automatic backup in background thread (Subfase 3.1, H-12, H-42)
    import threading
    app_instance = current_app._get_current_object()

    def _async_backup():
        with app_instance.app_context():
            try:
                from app.services.backup_service import create_backup, apply_retention
                create_backup()
                apply_retention()
            except Exception as exc:
                app_instance.logger.error(
                    f"[BACKUP ERROR] Error creating automated backup on session close: {exc}"
                )

    t = threading.Thread(target=_async_backup, daemon=True)
    t.start()

    res = session_schema.dump(session)
    res["backup"] = {"status": "en_progreso"}
    return jsonify(res), 200


@cash_register_bp.route("/<int:session_id>/summary", methods=["GET"])
@require_permission("caja:ver")
def session_summary(session_id):
    """Get a cash cut summary for a session: sales count, totals by payment method."""
    session = db.session.get(CashRegisterSession, session_id)
    if not session:
        return jsonify({"error": "Sesión no encontrada"}), 404

    # Count sales by status (sales in partial/full return are still recorded as sales)
    sales_completed = Sale.query.filter(
        Sale.session_id == session_id,
        Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
    ).count()
    sales_cancelled = Sale.query.filter_by(session_id=session_id, status="cancelada").count()

    # Total by payment method (including sales in return)
    payment_totals = (
        db.session.query(
            Payment.method,
            func.sum(Payment.amount).label("total"),
            func.sum(Payment.change_amount).label("change_total"),
        )
        .join(Sale, Sale.id == Payment.sale_id)
        .filter(
            Sale.session_id == session_id,
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
        )
        .group_by(Payment.method)
        .all()
    )

    # Refunds by method from this session
    refund_totals = (
        db.session.query(
            SaleReturn.refund_method,
            func.sum(SaleReturn.refund_total).label("refund_total"),
        )
        .filter(SaleReturn.session_id == session_id)
        .group_by(SaleReturn.refund_method)
        .all()
    )
    refunds_by_method = {m: Decimal(str(tot)) for m, tot in refund_totals}

    methods = {}
    for method, total, change in payment_totals:
        net = Decimal(str(total)) - Decimal(str(change or 0)) - refunds_by_method.get(method, Decimal("0"))
        methods[method] = str(net.quantize(Decimal("0.01")))

    for method, ref_tot in refunds_by_method.items():
        if method not in methods:
            methods[method] = str((-ref_tot).quantize(Decimal("0.01")))

    # Grand total of sales minus refunds
    grand_sales = (
        db.session.query(func.coalesce(func.sum(Sale.total), 0))
        .filter(
            Sale.session_id == session_id,
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
        )
        .scalar()
    )
    total_refunds = sum(refunds_by_method.values(), Decimal("0"))
    grand_total = Decimal(str(grand_sales)) - total_refunds

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
    """Sesiones de caja paginadas (las más recientes primero); filtro opcional ?status=abierta (H-45)."""
    query = CashRegisterSession.query.order_by(CashRegisterSession.opened_at.desc())
    status = request.args.get("status")
    if status:
        query = query.filter(CashRegisterSession.status == status)
    return jsonify(paginate(query, sessions_schema)), 200


@cash_register_bp.route("/active", methods=["GET"])
@require_permission("caja:ver")
def get_active_session():
    """Get the active cash register session for the current user."""
    user_id = int(get_jwt_identity())
    session = CashRegisterSession.query.filter_by(
        user_id=user_id, status="abierta"
    ).order_by(CashRegisterSession.opened_at.desc()).first()
    if not session:
        return jsonify({"session": None}), 200
    return jsonify({"session": session_schema.dump(session)}), 200


@cash_register_bp.route("/<int:session_id>", methods=["GET"])
@require_permission("caja:ver")
def get_session(session_id):
    """Get detail of a specific cash register session."""
    session = db.session.get(CashRegisterSession, session_id)
    if not session:
        return jsonify({"error": "Sesión no encontrada"}), 404
    return jsonify(session_schema.dump(session)), 200
