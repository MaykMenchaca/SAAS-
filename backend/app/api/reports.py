"""Reports API — dashboard KPIs, sales reports, inventory valuation, and margin analysis."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app.extensions import db
from app.models.inventory import Stock
from app.models.product import Product
from app.models.sale import Payment, Sale, SaleItem, SaleReturn, SaleReturnItem
from app.utils.decorators import require_permission

reports_bp = Blueprint("reports", __name__)


@reports_bp.route("/dashboard", methods=["GET"])
@require_permission("reportes:ver")
def dashboard():
    """Return dashboard KPIs: sales counts, revenue, top products, low stock."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    # Sales and revenue — today
    today_stats = _get_period_stats(today_start, now)
    week_stats = _get_period_stats(week_start, now)
    month_stats = _get_period_stats(month_start, now)

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

    # Low stock count
    low_stock_count = (
        Stock.query
        .join(Product)
        .filter(
            Product.is_active.is_(True),
            Product.min_stock > 0,
            Stock.quantity < Product.min_stock,
        )
        .count()
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
    }), 200


def _get_period_stats(start: datetime, end: datetime) -> dict:
    """Get sale count and total revenue for a period, net of returns."""
    result = (
        db.session.query(
            func.count(Sale.id).label("count"),
            func.coalesce(func.sum(Sale.total), 0).label("revenue"),
        )
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= start,
            Sale.created_at <= end,
        )
        .one()
    )
    refunds = (
        db.session.query(func.coalesce(func.sum(SaleReturn.refund_total), 0))
        .filter(
            SaleReturn.created_at >= start,
            SaleReturn.created_at <= end,
        )
        .scalar()
    )
    net_revenue = Decimal(str(result.revenue)) - Decimal(str(refunds))
    return {
        "count": result.count,
        "revenue": str(max(Decimal("0"), net_revenue).quantize(Decimal("0.01"))),
    }


# --- Task 31: Sales report by period ---


@reports_bp.route("/sales", methods=["GET"])
@require_permission("reportes:ver")
def sales_report():
    """Sales report with date range filters and payment method breakdown.

    Query params:
        from: Start date (YYYY-MM-DD), defaults to 30 days ago.
        to: End date (YYYY-MM-DD), defaults to today.
    """
    now = datetime.now(timezone.utc)
    date_from = request.args.get("from")
    date_to = request.args.get("to")

    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        start = (now - timedelta(days=30)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
    else:
        end = now

    # Summary stats
    stats = _get_period_stats(start, end)

    # Sales by day (net of refunds)
    daily_sales = (
        db.session.query(
            func.date_trunc("day", Sale.created_at).label("day"),
            func.count(Sale.id).label("count"),
            func.coalesce(func.sum(Sale.total), 0).label("revenue"),
        )
        .filter(
            Sale.status.in_(["completada", "devolucion_parcial", "devolucion_total"]),
            Sale.created_at >= start,
            Sale.created_at <= end,
        )
        .group_by(func.date_trunc("day", Sale.created_at))
        .all()
    )
    daily_refunds = (
        db.session.query(
            func.date_trunc("day", SaleReturn.created_at).label("day"),
            func.coalesce(func.sum(SaleReturn.refund_total), 0).label("refund_total"),
        )
        .filter(
            SaleReturn.created_at >= start,
            SaleReturn.created_at <= end,
        )
        .group_by(func.date_trunc("day", SaleReturn.created_at))
        .all()
    )
    ref_day_map = {d: Decimal(str(tot)) for d, tot in daily_refunds}
    daily = []
    for day, count, rev in daily_sales:
        net_rev = Decimal(str(rev)) - ref_day_map.get(day, Decimal("0"))
        daily.append((day, count, max(Decimal("0"), net_rev)))
    daily.sort(key=lambda x: x[0])

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
            Sale.created_at <= end,
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
            SaleReturn.created_at <= end,
        )
        .group_by(SaleReturn.refund_method)
        .all()
    )
    ref_method_map = {m: Decimal(str(tot)) for m, tot in refund_methods}

    # Cancelled count
    cancelled = (
        db.session.query(func.count(Sale.id))
        .filter(
            Sale.status == "cancelada",
            Sale.created_at >= start,
            Sale.created_at <= end,
        )
        .scalar()
    )

    return jsonify({
        "period": {
            "from": start.strftime("%Y-%m-%d"),
            "to": end.strftime("%Y-%m-%d"),
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
                "net_amount": str(
                    max(Decimal("0"), Decimal(str(net)) - ref_method_map.get(method, Decimal("0"))).quantize(
                        Decimal("0.01")
                    )
                ),
            }
            for method, count, net in payment_breakdown
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
        .filter(Product.is_active.is_(True))
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
    now = datetime.now(timezone.utc)
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    sort_by = request.args.get("sort", "quantity")
    limit = min(request.args.get("limit", 20, type=int), 100)

    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        start = (now - timedelta(days=30)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
    else:
        end = now

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
            Sale.created_at <= end,
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
            SaleReturn.created_at <= end,
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
            "from": start.strftime("%Y-%m-%d"),
            "to": end.strftime("%Y-%m-%d"),
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
    now = datetime.now(timezone.utc)
    date_from = request.args.get("from")
    date_to = request.args.get("to")

    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        start = (now - timedelta(days=30)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
    else:
        end = now

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
            Sale.created_at <= end,
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
            SaleReturn.created_at <= end,
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
            "from": start.strftime("%Y-%m-%d"),
            "to": end.strftime("%Y-%m-%d"),
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
