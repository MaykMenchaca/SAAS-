"""Reports API — dashboard KPIs and data exports."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, jsonify
from sqlalchemy import func

from app.extensions import db
from app.models.inventory import Stock
from app.models.product import Product
from app.models.sale import Sale, SaleItem
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

    # Top 5 products by quantity sold (this month)
    top_products = (
        db.session.query(
            SaleItem.product_name,
            func.sum(SaleItem.quantity).label("total_qty"),
            func.sum(SaleItem.subtotal).label("total_revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(
            Sale.status == "completada",
            Sale.created_at >= month_start,
        )
        .group_by(SaleItem.product_name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(5)
        .all()
    )

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
                "name": name,
                "quantity": str(Decimal(str(qty)).quantize(Decimal("0.001"))),
                "revenue": str(Decimal(str(rev)).quantize(Decimal("0.01"))),
            }
            for name, qty, rev in top_products
        ],
        "low_stock_count": low_stock_count,
    }), 200


def _get_period_stats(start: datetime, end: datetime) -> dict:
    """Get sale count and total revenue for a period."""
    result = (
        db.session.query(
            func.count(Sale.id).label("count"),
            func.coalesce(func.sum(Sale.total), 0).label("revenue"),
        )
        .filter(
            Sale.status == "completada",
            Sale.created_at >= start,
            Sale.created_at <= end,
        )
        .one()
    )
    return {
        "count": result.count,
        "revenue": str(Decimal(str(result.revenue)).quantize(Decimal("0.01"))),
    }
