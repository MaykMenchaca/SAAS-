import shutil
from flask import jsonify

BLUEPRINTS = [
    ("app.api.auth", "auth_bp", "/api/auth"),
    ("app.api.users", "users_bp", "/api/users"),
    ("app.api.products", "products_bp", "/api/products"),
    ("app.api.categories", "categories_bp", "/api/categories"),
    ("app.api.inventory", "inventory_bp", "/api/inventory"),
    ("app.api.sales", "sales_bp", "/api/sales"),
    ("app.api.cash_register", "cash_register_bp", "/api/cash-register"),
    ("app.api.purchases", "purchases_bp", "/api/purchases"),
    ("app.api.reports", "reports_bp", "/api/reports"),
    ("app.api.printing", "printing_bp", "/api/printing"),
    ("app.api.config", "config_bp", "/api/config"),
    ("app.api.audit", "audit_bp", "/api/audit"),
    ("app.api.backup", "backup_bp", "/api/backup"),
]


def register_blueprints(app):
    for module_path, bp_name, prefix in BLUEPRINTS:
        try:
            module = __import__(module_path, fromlist=[bp_name])
            bp = getattr(module, bp_name)
            app.register_blueprint(bp, url_prefix=prefix)
        except Exception as e:
            raise RuntimeError(
                f"Error al registrar blueprint '{bp_name}' desde '{module_path}': {e}"
            ) from e

    @app.route("/api/health")
    def health():
        from sqlalchemy import text
        from app.extensions import db
        from app.services.backup_service import list_backups, _get_backup_dir

        try:
            db.session.execute(text("SELECT 1"))
            db_status = "ok"
        except Exception:
            db_status = "error"

        try:
            backups = list_backups()
            last_backup = backups[0]["created_at"] if backups else None
        except Exception:
            last_backup = None

        # Espacio en disco
        disk_info = {}
        try:
            backup_dir = _get_backup_dir()
            total, used, free = shutil.disk_usage(backup_dir)
            disk_info = {
                "total_gb": round(total / (1024**3), 2),
                "used_gb": round(used / (1024**3), 2),
                "free_gb": round(free / (1024**3), 2),
                "percent_used": round((used / total) * 100, 1),
            }
        except Exception:
            disk_info = {"status": "unavailable"}

        overall_status = "ok" if db_status == "ok" else "error"
        status_code = 200 if db_status == "ok" else 503
        return jsonify({
            "status": overall_status,
            "db": db_status,
            "last_backup_at": last_backup,
            "disk": disk_info,
        }), status_code
