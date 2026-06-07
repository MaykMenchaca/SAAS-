from flask import jsonify


def register_blueprints(app):
    _BLUEPRINTS = [
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
    ]

    for module_path, bp_name, prefix in _BLUEPRINTS:
        try:
            module = __import__(module_path, fromlist=[bp_name])
            bp = getattr(module, bp_name)
            app.register_blueprint(bp, url_prefix=prefix)
        except (ImportError, AttributeError):
            pass

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"}), 200
