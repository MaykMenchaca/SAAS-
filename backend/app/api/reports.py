"""Reports API — dashboard KPIs, sales reports, inventory valuation, and margin analysis."""
from datetime import datetime, timedelta
from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app.extensions import db
from app.models.inventory import Stock
from app.models.product import Product
from app.models.sale import (
    CashRegister,
    CashRegisterSession,
    Payment,
    Sale,
    SaleItem,
    SaleReturn,
    SaleReturnItem,
)
from app.models.user import User
from app.utils.decorators import require_permission
from app.utils.timeutil import (
    InvalidDateError,
    app_tz,
    local_day_bounds,
    local_today,
    parse_local_date,
)

reports_bp = Blueprint("reports", __name__)

# Años aceptados en los rangos de reportes: fuera de aquí las fechas no tienen sentido para la tienda y los
# extremos (0001, 9999) desbordaban el cálculo de límites del día y daban 500 (RF-44)
REPORT_MIN_YEAR = 2000
REPORT_MAX_YEAR = 2100
TOP_PRODUCTS_MAX_LIMIT = 100


class ReportParamError(ValueError):
    """Parámetro de reporte inválido (no de fecha): 400 con el mensaje."""


@reports_bp.errorhandler(ReportParamError)
def _report_param_error(e):
    return jsonify({"error": str(e)}), 400


@reports_bp.route("/dashboard", methods=["GET"])
@require_permission("reportes:ver")
def dashboard():
    """Return dashboard KPIs: sales counts, revenue, top products, low stock."""
    today = local_today()
    today_start, today_end = local_day_bounds(today)
    week_start, _ = local_day_bounds(today - timedelta(days=today.weekday()))
    first_of_month = today.replace(day=1)
    month_start, _ = local_day_bounds(first_of_month)

    # Sales and revenue — today (días en la zona horaria de la tienda)
    today_stats = _get_period_stats(today_start, today_end)
    week_stats = _get_period_stats(week_start, today_end)
    month_stats = _get_period_stats(month_start, today_end)

    # Periodos anteriores para las tendencias (H-27): ayer y el mismo tramo del mes anterior
    prev_day_stats = _get_period_stats(local_day_bounds(today - timedelta(days=1))[0], today_start)
    prev_month_first = (first_of_month - timedelta(days=1)).replace(day=1)
    prev_month_cut = min(prev_month_first + timedelta(days=today.day), first_of_month)
    prev_month_stats = _get_period_stats(
        local_day_bounds(prev_month_first)[0], local_day_bounds(prev_month_cut)[0]
    )

    # Top 5 products by quantity sold (this month, net of returns)
    sold_rows = (
        db.session.query(
            SaleItem.product_name,
            SaleItem.product_id,
            func.sum(SaleItem.quantity).label("total_qty"),
            func.sum(SaleItem.subtotal).label("total_revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= month_start,
        )
        .group_by(SaleItem.product_name, SaleItem.product_id)
        .all()
    )

    returned_rows = (
        db.session.query(
            SaleReturnItem.product_id,
            func.sum(SaleReturnItem.quantity).label("ret_qty"),
        )
        .join(SaleReturn, SaleReturn.id == SaleReturnItem.sale_return_id)
        .filter(
            SaleReturn.created_at >= month_start,
        )
        .group_by(SaleReturnItem.product_id)
        .all()
    )
    ret_map = {r.product_id: Decimal(str(r.ret_qty)) for r in returned_rows}

    product_stats = []
    for name, pid, total_qty, total_rev in sold_rows:
        ret_qty = ret_map.get(pid, Decimal("0"))
        net_qty = Decimal(str(total_qty)) - ret_qty
        if net_qty > Decimal("0"):
            unit_subtotal = Decimal(str(total_rev)) / Decimal(str(total_qty))
            net_rev = (unit_subtotal * net_qty).quantize(Decimal("0.01"))
            product_stats.append({
                "name": name,
                "quantity": net_qty,
                "revenue": net_rev,
            })
    product_stats.sort(key=lambda p: p["quantity"], reverse=True)
    top_products = product_stats[:5]

    # Stock bajo con la misma regla que los KPI de Inventario (/inventory/summary): agotados (stock <= 0, con o
    # sin mínimo; sin registro de stock = 0) + bajo mínimo (mínimo > 0, stock > 0 y stock <= mínimo).
    # Antes solo contaba stock < mínimo y no coincidía con Inventario ni con el badge del menú
    qty = func.coalesce(Stock.quantity, 0)
    low_stock_count = (
        db.session.query(func.count(Product.id))
        .outerjoin(Stock, Stock.product_id == Product.id)
        .filter(
            Product.is_active.is_(True),
            db.or_(qty <= 0, db.and_(Product.min_stock > 0, qty <= Product.min_stock)),
        )
        .scalar()
    )

    return jsonify({
        "sales_today": today_stats["count"],
        "revenue_today": today_stats["revenue"],
        "sales_week": week_stats["count"],
        "revenue_week": week_stats["revenue"],
        "sales_month": month_stats["count"],
        "revenue_month": month_stats["revenue"],
        "top_products": [
            {
                "name": p["name"],
                "quantity": str(p["quantity"].quantize(Decimal("0.001"))),
                "revenue": str(p["revenue"].quantize(Decimal("0.01"))),
            }
            for p in top_products
        ],
        "low_stock_count": low_stock_count,
        "sales_prev_day": prev_day_stats["count"],
        "revenue_prev_day": prev_day_stats["revenue"],
        "sales_prev_month": prev_month_stats["count"],
        "revenue_prev_month": prev_month_stats["revenue"],
        "open_sessions": _open_sessions_summary(),
    }), 200


def _open_sessions_summary() -> list[dict]:
    """Turnos abiertos con lo vendido en cada uno (neto de reembolsos de la sesión)."""
    sessions = (
        db.session.query(CashRegisterSession, CashRegister.name, User.full_name)
        .join(CashRegister, CashRegister.id == CashRegisterSession.cash_register_id)
        .join(User, User.id == CashRegisterSession.user_id)
        .filter(CashRegisterSession.status == "abierta")
        .order_by(CashRegister.name)
        .all()
    )
    result = []
    for session, register_name, user_name in sessions:
        count, revenue = (
            db.session.query(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0))
            .filter(
                Sale.session_id == session.id,
                Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            )
            .one()
        )
        refunds = (
            db.session.query(func.coalesce(func.sum(SaleReturn.refund_total), 0))
            .filter(SaleReturn.session_id == session.id)
            .scalar()
        )
        # Neto real: un turno con solo devoluciones queda en negativo (salida de efectivo), no en 0
        net = Decimal(str(revenue)) - Decimal(str(refunds))
        result.append({
            "id": session.id,
            "register": register_name,
            "user_id": session.user_id,
            "user": user_name,
            "opened_at": session.opened_at.isoformat() if session.opened_at else None,
            "revenue": str(net.quantize(Decimal("0.01"))),
            "count": count,
        })
    return result


def _get_period_stats(start: datetime, end: datetime) -> dict:
    """Get sale count and total revenue for [start, end), net of returns.

    Neto real, sin recortar a 0: un periodo con más reembolsos que ventas sale en negativo, tanto en el
    reporte de ventas (RF-25) como en el tablero (pendiente de Fase 3).
    """
    result = (
        db.session.query(
            func.count(Sale.id).label("count"),
            func.coalesce(func.sum(Sale.total), 0).label("revenue"),
        )
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= start,
            Sale.created_at < end,
        )
        .one()
    )
    refunds = (
        db.session.query(func.coalesce(func.sum(SaleReturn.refund_total), 0))
        .filter(
            SaleReturn.created_at >= start,
            SaleReturn.created_at < end,
        )
        .scalar()
    )
    net_revenue = Decimal(str(result.revenue)) - Decimal(str(refunds))
    return {
        "count": result.count,
        "revenue": str(net_revenue.quantize(Decimal("0.01"))),
    }


def _resolve_local_range():
    """Fechas locales `from`/`to` (YYYY-MM-DD); por defecto, los últimos 30 días hasta hoy."""
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    last_day = parse_local_date(date_to) if date_to else local_today()
    first_day = parse_local_date(date_from) if date_from else last_day - timedelta(days=30)
    # Rango acotado y ordenado (RF-44): InvalidDateError responde 400 con el mensaje
    for day in (first_day, last_day):
        if not REPORT_MIN_YEAR <= day.year <= REPORT_MAX_YEAR:
            raise InvalidDateError(
                f"Fecha fuera de rango: '{day.isoformat()}'. Usa fechas entre los años "
                f"{REPORT_MIN_YEAR} y {REPORT_MAX_YEAR}"
            )
    if first_day > last_day:
        raise InvalidDateError("La fecha inicial (from) debe ser anterior o igual a la final (to)")
    return first_day, last_day


def _parse_limit(default: int = 20) -> int:
    """`limit` entero entre 1 y TOP_PRODUCTS_MAX_LIMIT; otro valor → ReportParamError (400) (RF-44).

    Antes limit=-1 recortaba el último producto (items[:-1]) y limit=0 devolvía vacío sin avisar.
    """
    raw = request.args.get("limit")
    if raw is None or raw.strip() == "":
        return default
    try:
        limit = int(raw.strip())
    except ValueError:
        limit = 0
    if not 1 <= limit <= TOP_PRODUCTS_MAX_LIMIT:
        raise ReportParamError(f"El parámetro limit debe ser un entero entre 1 y {TOP_PRODUCTS_MAX_LIMIT}")
    return limit


# --- Task 31: Sales report by period ---


@reports_bp.route("/sales", methods=["GET"])
@require_permission("reportes:ver")
def sales_report():
    """Sales report with date range filters and payment method breakdown.

    Query params:
        from: Start date (YYYY-MM-DD), defaults to 30 days ago.
        to: End date (YYYY-MM-DD), defaults to today.
    """
    first_day, last_day = _resolve_local_range()
    start, _ = local_day_bounds(first_day)
    _, end = local_day_bounds(last_day)

    # Summary stats: sin recortar a 0 para que cuadre con daily y payment_methods (RF-25)
    stats = _get_period_stats(start, end)

    # Sales by day (net of refunds), agrupadas por día local
    tz_name = app_tz().key
    sale_day = func.date_trunc("day", func.timezone(tz_name, Sale.created_at))
    return_day = func.date_trunc("day", func.timezone(tz_name, SaleReturn.created_at))
    daily_sales = (
        db.session.query(
            sale_day.label("day"),
            func.count(Sale.id).label("count"),
            func.coalesce(func.sum(Sale.total), 0).label("revenue"),
        )
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= start,
            Sale.created_at < end,
        )
        .group_by(sale_day)
        .all()
    )
    daily_refunds = (
        db.session.query(
            return_day.label("day"),
            func.coalesce(func.sum(SaleReturn.refund_total), 0).label("refund_total"),
        )
        .filter(
            SaleReturn.created_at >= start,
            SaleReturn.created_at < end,
        )
        .group_by(return_day)
        .all()
    )
    # Se unen los días con ventas y los días con reembolsos, sin recortar a 0 (RF-25): un día con
    # solo devoluciones aparece con 0 ventas e ingreso negativo, y la suma de daily = total_revenue
    day_map = {d: [count, Decimal(str(rev))] for d, count, rev in daily_sales}
    for d, tot in daily_refunds:
        day_map.setdefault(d, [0, Decimal("0")])[1] -= Decimal(str(tot))
    daily = sorted((d, count, net) for d, (count, net) in day_map.items())

    # Payment method breakdown (net of refunds per method)
    payment_breakdown = (
        db.session.query(
            Payment.method,
            func.count(Payment.id).label("count"),
            func.coalesce(func.sum(Payment.amount - Payment.change_amount), 0).label(
                "net_amount"
            ),
        )
        .join(Sale, Sale.id == Payment.sale_id)
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= start,
            Sale.created_at < end,
        )
        .group_by(Payment.method)
        .all()
    )
    refund_methods = (
        db.session.query(
            SaleReturn.refund_method,
            func.coalesce(func.sum(SaleReturn.refund_total), 0).label("refund_total"),
        )
        .filter(
            SaleReturn.created_at >= start,
            SaleReturn.created_at < end,
        )
        .group_by(SaleReturn.refund_method)
        .all()
    )
    # Igual con los métodos (RF-25): un reembolso a tarjeta de una venta de otro día resta en
    # "tarjeta" aunque en el periodo no haya ventas con tarjeta
    method_map = {m: [count, Decimal(str(net))] for m, count, net in payment_breakdown}
    for m, tot in refund_methods:
        method_map.setdefault(m, [0, Decimal("0")])[1] -= Decimal(str(tot))

    # Cancelled count
    cancelled = (
        db.session.query(func.count(Sale.id))
        .filter(
            Sale.status == "cancelada",
            Sale.created_at >= start,
            Sale.created_at < end,
        )
        .scalar()
    )

    return jsonify({
        "period": {
            "from": first_day.isoformat(),
            "to": last_day.isoformat(),
        },
        "total_sales": stats["count"],
        "total_revenue": stats["revenue"],
        "cancelled_sales": cancelled,
        "daily": [
            {
                "date": day.strftime("%Y-%m-%d"),
                "count": count,
                "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01"))),
            }
            for day, count, rev in daily
        ],
        "payment_methods": [
            {
                "method": method,
                "count": count,
                "net_amount": str(net.quantize(Decimal("0.01"))),
            }
            for method, (count, net) in sorted(method_map.items())
        ],
    }), 200


# --- Task 32: Inventory valuation ---


@reports_bp.route("/inventory-valuation", methods=["GET"])
@require_permission("reportes:ver")
def inventory_valuation():
    """Inventory valuation report: current stock * avg_cost for all products."""
    rows = (
        db.session.query(
            Product.id,
            Product.sku,
            Product.name,
            Stock.quantity,
            Product.avg_cost,
            (Stock.quantity * Product.avg_cost).label("valuation"),
        )
        .join(Stock, Stock.product_id == Product.id)
        # Los inactivos con existencias también valen dinero en el almacén (H-43)
        .filter(db.or_(Product.is_active.is_(True), Stock.quantity != 0))
        .order_by(Product.name)
        .all()
    )

    total_valuation = sum(r.valuation for r in rows)
    total_units = sum(r.quantity for r in rows)

    return jsonify({
        "total_valuation": str(Decimal(str(total_valuation)).quantize(Decimal("0.01"))),
        "total_units": str(Decimal(str(total_units)).quantize(Decimal("0.001"))),
        "product_count": len(rows),
        "items": [
            {
                "product_id": r.id,
                "sku": r.sku,
                "name": r.name,
                "quantity": str(Decimal(str(r.quantity)).quantize(Decimal("0.001"))),
                "avg_cost": str(Decimal(str(r.avg_cost)).quantize(Decimal("0.01"))),
                "valuation": str(Decimal(str(r.valuation)).quantize(Decimal("0.01"))),
            }
            for r in rows
        ],
    }), 200


# --- Task 33: Top products report ---


@reports_bp.route("/top-products", methods=["GET"])
@require_permission("reportes:ver")
def top_products_report():
    """Top products by quantity sold or revenue for a date range.

    Query params:
        from: Start date (YYYY-MM-DD), defaults to 30 days ago.
        to: End date (YYYY-MM-DD), defaults to today.
        sort: "quantity" (default) or "revenue".
        limit: Number of products (default 20, max 100).
    """
    first_day, last_day = _resolve_local_range()
    sort_by = request.args.get("sort", "quantity")
    limit = _parse_limit()
    start, _ = local_day_bounds(first_day)
    _, end = local_day_bounds(last_day)

    sold_rows = (
        db.session.query(
            SaleItem.product_id,
            SaleItem.product_name,
            SaleItem.product_sku,
            func.sum(SaleItem.quantity).label("total_qty"),
            func.sum(SaleItem.subtotal).label("total_revenue"),
            func.count(func.distinct(Sale.id)).label("sale_count"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= start,
            Sale.created_at < end,
        )
        .group_by(SaleItem.product_id, SaleItem.product_name, SaleItem.product_sku)
        .all()
    )

    returned_rows = (
        db.session.query(
            SaleReturnItem.product_id,
            func.sum(SaleReturnItem.quantity).label("ret_qty"),
        )
        .join(SaleReturn, SaleReturn.id == SaleReturnItem.sale_return_id)
        .filter(
            SaleReturn.created_at >= start,
            SaleReturn.created_at < end,
        )
        .group_by(SaleReturnItem.product_id)
        .all()
    )
    ret_qty_map = {r.product_id: Decimal(str(r.ret_qty)) for r in returned_rows}

    items = []
    for r in sold_rows:
        ret_qty = ret_qty_map.get(r.product_id, Decimal("0"))
        net_qty = Decimal(str(r.total_qty)) - ret_qty
        if net_qty > Decimal("0"):
            unit_subtotal = Decimal(str(r.total_revenue)) / Decimal(str(r.total_qty))
            net_rev = (unit_subtotal * net_qty).quantize(Decimal("0.01"))
            items.append({
                "product_id": r.product_id,
                "product_name": r.product_name,
                "product_sku": r.product_sku,
                "total_quantity": net_qty,
                "total_revenue": net_rev,
                "sale_count": r.sale_count,
            })

    order_key = "total_revenue" if sort_by == "revenue" else "total_quantity"
    items.sort(key=lambda x: x[order_key], reverse=True)
    items = items[:limit]

    return jsonify({
        "period": {
            "from": first_day.isoformat(),
            "to": last_day.isoformat(),
        },
        "sort_by": sort_by,
        "items": [
            {
                "product_id": r["product_id"],
                "product_name": r["product_name"],
                "product_sku": r["product_sku"],
                "total_quantity": str(r["total_quantity"].quantize(Decimal("0.001"))),
                "total_revenue": str(r["total_revenue"].quantize(Decimal("0.01"))),
                "sale_count": r["sale_count"],
            }
            for r in items
        ],
    }), 200


# --- Task 34: Gross margin report ---


@reports_bp.route("/gross-margin", methods=["GET"])
@require_permission("reportes:ver")
def gross_margin_report():
    """Gross margin report: revenue - cost for each product.

    Query params:
        from: Start date (YYYY-MM-DD), defaults to 30 days ago.
        to: End date (YYYY-MM-DD), defaults to today.
    """
    first_day, last_day = _resolve_local_range()
    start, _ = local_day_bounds(first_day)
    _, end = local_day_bounds(last_day)

    sold_rows = (
        db.session.query(
            SaleItem.product_id,
            SaleItem.product_name,
            SaleItem.product_sku,
            func.sum(SaleItem.quantity).label("total_qty"),
            func.sum(SaleItem.subtotal).label("total_revenue"),
            func.sum(SaleItem.quantity * SaleItem.cost_at_sale).label("total_cost"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= start,
            Sale.created_at < end,
        )
        .group_by(SaleItem.product_id, SaleItem.product_name, SaleItem.product_sku)
        .all()
    )

    returned_rows = (
        db.session.query(
            SaleReturnItem.product_id,
            func.sum(SaleReturnItem.quantity).label("ret_qty"),
        )
        .join(SaleReturn, SaleReturn.id == SaleReturnItem.sale_return_id)
        .filter(
            SaleReturn.created_at >= start,
            SaleReturn.created_at < end,
        )
        .group_by(SaleReturnItem.product_id)
        .all()
    )
    ret_qty_map = {r.product_id: Decimal(str(r.ret_qty)) for r in returned_rows}

    items = []
    for r in sold_rows:
        ret_qty = ret_qty_map.get(r.product_id, Decimal("0"))
        net_qty = Decimal(str(r.total_qty)) - ret_qty
        if net_qty > Decimal("0"):
            unit_subtotal = Decimal(str(r.total_revenue)) / Decimal(str(r.total_qty))
            unit_cost = Decimal(str(r.total_cost)) / Decimal(str(r.total_qty))
            net_rev = (unit_subtotal * net_qty).quantize(Decimal("0.01"))
            net_cost = (unit_cost * net_qty).quantize(Decimal("0.01"))
            margin = net_rev - net_cost
            margin_pct = (
                (margin / net_rev * 100).quantize(Decimal("0.01"))
                if net_rev > Decimal("0")
                else Decimal("0")
            )
            items.append({
                "product_id": r.product_id,
                "product_name": r.product_name,
                "product_sku": r.product_sku,
                "total_quantity": net_qty,
                "total_revenue": net_rev,
                "total_cost": net_cost,
                "gross_margin": margin,
                "margin_percent": str(margin_pct),
            })

    items.sort(key=lambda x: x["total_revenue"], reverse=True)
    total_revenue = sum((p["total_revenue"] for p in items), Decimal("0"))
    total_cost = sum((p["total_cost"] for p in items), Decimal("0"))
    total_margin = total_revenue - total_cost
    margin_pct = (
        (total_margin / total_revenue * 100).quantize(Decimal("0.01"))
        if total_revenue > 0
        else Decimal("0")
    )

    return jsonify({
        "period": {
            "from": first_day.isoformat(),
            "to": last_day.isoformat(),
        },
        "summary": {
            "total_revenue": str(total_revenue.quantize(Decimal("0.01"))),
            "total_cost": str(total_cost.quantize(Decimal("0.01"))),
            "gross_margin": str(total_margin.quantize(Decimal("0.01"))),
            "margin_percent": str(margin_pct),
        },
        "items": [
            {
                "product_id": r["product_id"],
                "product_name": r["product_name"],
                "product_sku": r["product_sku"],
                "total_quantity": str(r["total_quantity"].quantize(Decimal("0.001"))),
                "total_revenue": str(r["total_revenue"].quantize(Decimal("0.01"))),
                "total_cost": str(r["total_cost"].quantize(Decimal("0.01"))),
                "gross_margin": str(r["gross_margin"].quantize(Decimal("0.01"))),
                "margin_percent": r["margin_percent"],
            }
            for r in items
        ],
    }), 200
