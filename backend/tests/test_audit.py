"""Tests for audit log model, service, and API."""
from app.models.audit import AuditLog
from app.services.audit_service import log_action, get_logs


# --- Model and service tests ---


def test_log_action_creates_entry(app, db, seed_admin):
    """log_action should create an AuditLog row."""
    entry = log_action(
        action="test_action",
        entity_type="widget",
        entity_id=42,
        details={"key": "value"},
        user_id=seed_admin.id,
        username=seed_admin.username,
    )
    assert entry.id is not None
    assert entry.action == "test_action"
    assert entry.entity_type == "widget"
    assert entry.entity_id == 42
    assert entry.details == {"key": "value"}
    assert entry.user_id == seed_admin.id
    assert entry.username == "admin"


def test_get_logs_pagination(app, db, seed_admin):
    """get_logs should return paginated results."""
    for i in range(5):
        log_action(action=f"action_{i}", user_id=seed_admin.id, username="admin")

    result = get_logs(page=1, per_page=3)
    assert result["total"] == 5
    assert result["page"] == 1
    assert result["per_page"] == 3
    assert len(result["items"]) == 3
    assert result["pages"] == 2

    result2 = get_logs(page=2, per_page=3)
    assert len(result2["items"]) == 2


def test_get_logs_filter_by_action(app, db, seed_admin):
    """get_logs should filter by action type."""
    log_action(action="login", user_id=seed_admin.id, username="admin")
    log_action(action="create", user_id=seed_admin.id, username="admin")
    log_action(action="login", user_id=seed_admin.id, username="admin")

    result = get_logs(action="login")
    assert result["total"] == 2


def test_get_logs_filter_by_entity(app, db, seed_admin):
    """get_logs should filter by entity_type and entity_id."""
    log_action(
        action="create", entity_type="sale", entity_id=1,
        user_id=seed_admin.id, username="admin",
    )
    log_action(
        action="create", entity_type="product", entity_id=2,
        user_id=seed_admin.id, username="admin",
    )
    log_action(
        action="update", entity_type="sale", entity_id=1,
        user_id=seed_admin.id, username="admin",
    )

    result = get_logs(entity_type="sale")
    assert result["total"] == 2

    result2 = get_logs(entity_type="sale", entity_id=1)
    assert result2["total"] == 2

    result3 = get_logs(entity_type="product")
    assert result3["total"] == 1


def test_get_logs_filter_by_user(app, db, seed_admin, seed_cajero):
    """get_logs should filter by user_id."""
    log_action(action="login", user_id=seed_admin.id, username="admin")
    log_action(action="login", user_id=seed_cajero.id, username="cajero1")
    log_action(action="logout", user_id=seed_admin.id, username="admin")

    result = get_logs(user_id=seed_admin.id)
    assert result["total"] == 2

    result2 = get_logs(user_id=seed_cajero.id)
    assert result2["total"] == 1


# --- API endpoint tests ---


def test_audit_list_requires_admin(client, db, seed_permissions, seed_roles):
    """GET /api/audit/ should require admin role."""
    response = client.get("/api/audit/")
    assert response.status_code == 401


def test_audit_list_non_admin_forbidden(client, regular_user_token, db):
    """GET /api/audit/ should reject non-admin users."""
    response = client.get(
        "/api/audit/",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert response.status_code == 403


def test_audit_list_returns_logs(client, admin_token, db, seed_admin):
    """GET /api/audit/ should return audit entries."""
    log_action(action="login", entity_type="user", user_id=seed_admin.id, username="admin")
    log_action(action="create", entity_type="sale", entity_id=99, user_id=seed_admin.id, username="admin")

    response = client.get(
        "/api/audit/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 3  # 2 manual + 1 login from admin_token fixture
    assert "items" in data
    assert data["page"] == 1


def test_audit_list_filters(client, admin_token, db, seed_admin):
    """GET /api/audit/ should support query param filters."""
    log_action(action="create", entity_type="product", entity_id=5, user_id=seed_admin.id, username="admin")

    response = client.get(
        "/api/audit/?action=create&entity_type=product",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 1
    assert data["items"][0]["action"] == "create"
    assert data["items"][0]["entity_type"] == "product"


# --- Integration: login creates audit entry ---


def test_login_creates_audit_entry(client, db, seed_admin):
    """Successful login should create an audit log entry."""
    client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })

    logs = AuditLog.query.filter_by(action="login").all()
    assert len(logs) == 1
    assert logs[0].user_id == seed_admin.id
    assert logs[0].entity_type == "user"


def test_failed_login_creates_audit_entry(client, db, seed_admin):
    """Failed login should log a login_failed entry."""
    client.post("/api/auth/login", json={
        "username": "admin",
        "password": "wrong_password",
    })

    logs = AuditLog.query.filter_by(action="login_failed").all()
    assert len(logs) == 1
    assert logs[0].details["username"] == "admin"


def test_sale_create_creates_audit_entry(
    client, admin_token, seed_open_session, seed_product_for_sale, db
):
    """Creating a sale should log an audit entry."""
    client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": [
                {
                    "product_id": seed_product_for_sale.id,
                    "quantity": 1,
                    "unit_price": "100.00",
                    "tax_rate": "16.00",
                }
            ],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
        },
    )

    logs = AuditLog.query.filter_by(action="create", entity_type="sale").all()
    assert len(logs) == 1
    assert logs[0].details["folio"] is not None


class TestAuditPersistenceAndCoverage:
    """H-09, H-39, H-34: Las entradas de auditoría deben persistir en base de datos real
    y ser legibles desde una sesión de base de datos nueva y limpia.
    """

    def test_sale_audit_persists_in_new_db_session(
        self, client, admin_token, seed_open_session, seed_product_for_sale, db
    ):
        """H-09: La creación de venta debe persistir su auditoría antes del commit del servicio."""
        resp = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
                "payments": [{"method": "efectivo", "amount": "116.00"}],
            },
        )
        assert resp.status_code == 201

        # Limpiar la sesión de SQLAlchemy para garantizar lectura desde la base de datos real
        db.session.remove()

        logs = AuditLog.query.filter_by(action="create", entity_type="sale").all()
        assert len(logs) == 1
        assert logs[0].details["folio"] is not None
        assert logs[0].details["total"] == "116.00"

    def test_failed_login_audit_persists_in_new_db_session(self, client, db, seed_admin):
        """H-09: Los intentos fallidos de login deben persistir con su propio commit."""
        expected_username = seed_admin.username
        resp = client.post(
            "/api/auth/login",
            json={"username": expected_username, "password": "wrong_password_test"},
        )
        assert resp.status_code == 401

        db.session.remove()

        logs = AuditLog.query.filter_by(action="login_failed").all()
        assert len(logs) == 1
        assert logs[0].details["username"] == expected_username

    def test_return_sale_audit_persists_in_new_db_session(
        self, client, admin_token, seed_open_session, seed_product_for_sale, db
    ):
        """H-39: Las devoluciones deben quedar registradas en la auditoría."""
        resp_sale = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
                "payments": [{"method": "efectivo", "amount": "116.00"}],
            },
        )
        sale_id = resp_sale.get_json()["id"]
        sale_item_id = resp_sale.get_json()["items"][0]["id"]

        resp_ret = client.post(
            f"/api/sales/{sale_id}/return",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "reason": "Auditoría de devolución",
                "session_id": seed_open_session.id,
                "refund_method": "efectivo",
                "items": [{"sale_item_id": sale_item_id, "quantity": "1"}],
            },
        )
        assert resp_ret.status_code == 200

        db.session.remove()

        logs = AuditLog.query.filter_by(action="return", entity_type="sale").all()
        assert len(logs) == 1
        assert logs[0].entity_id == sale_id
        assert logs[0].details["refund_method"] == "efectivo"

    def test_cash_register_open_close_audit_persists_in_new_db_session(
        self, client, admin_token, seed_cash_register, db
    ):
        """H-39: Apertura y cierre de caja deben quedar registrados en la auditoría."""
        # Abrir caja
        resp_open = client.post(
            "/api/cash-register/open",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "cash_register_id": seed_cash_register.id,
                "opening_amount": "500.00",
            },
        )
        assert resp_open.status_code == 201
        session_id = resp_open.get_json()["id"]

        db.session.remove()
        open_logs = AuditLog.query.filter_by(
            action="open", entity_type="cash_register_session"
        ).all()
        assert len(open_logs) == 1
        assert open_logs[0].entity_id == session_id

        # Cerrar caja
        resp_close = client.post(
            f"/api/cash-register/{session_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"closing_amount": "500.00"},
        )
        assert resp_close.status_code == 200

        db.session.remove()
        close_logs = AuditLog.query.filter_by(
            action="close", entity_type="cash_register_session"
        ).all()
        assert len(close_logs) == 1
        assert close_logs[0].entity_id == session_id

    def test_inventory_adjust_audit_persists_in_new_db_session(
        self, client, admin_token, seed_product_for_sale, db
    ):
        """H-39: Ajustes de inventario deben registrarse en la auditoría."""
        prod_id = seed_product_for_sale.id
        resp = client.post(
            "/api/inventory/adjust",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "product_id": prod_id,
                "quantity": "50.000",
                "notes": "Ajuste auditado",
            },
        )
        assert resp.status_code == 200

        db.session.remove()

        adjust_logs = AuditLog.query.filter_by(action="adjust", entity_type="stock").all()
        assert len(adjust_logs) == 1
        assert adjust_logs[0].details["product_id"] == prod_id

    def test_inventory_count_audit_persists(self, seed_admin, seed_product_for_sale, db):
        """H-39: Conteos físicos deben auditar apertura, cierre y cancelación."""
        from app.services.inventory_count_service import InventoryCountService

        admin_id = seed_admin.id

        # 1. Crear conteo
        count = InventoryCountService.create_count(admin_id, notes="Conteo auditoría")
        count_id = count.id
        db.session.remove()

        log_create = AuditLog.query.filter_by(action="count_create", entity_type="inventory_count").first()
        assert log_create is not None
        assert log_create.entity_id == count_id

        # 2. Cerrar conteo
        InventoryCountService.close_count(count_id, admin_id)
        db.session.remove()

        log_close = AuditLog.query.filter_by(action="count_close", entity_type="inventory_count").first()
        assert log_close is not None
        assert log_close.entity_id == count_id

        # 3. Crear otro y cancelar
        count2 = InventoryCountService.create_count(admin_id, notes="Conteo cancelar")
        count2_id = count2.id
        InventoryCountService.cancel_count(count2_id, admin_id)
        db.session.remove()

        log_cancel = AuditLog.query.filter_by(action="count_cancel", entity_type="inventory_count").first()
        assert log_cancel is not None
        assert log_cancel.entity_id == count2_id

    def test_user_audit_persists_with_previous_and_new_values(
        self, client, admin_token, seed_roles, db
    ):
        """H-39: Usuarios y roles deben auditarse con valor anterior y nuevo."""
        role_cajero_id = seed_roles["cajero"].id
        role_admin_id = seed_roles["admin"].id

        # 1. Crear usuario
        resp_create = client.post(
            "/api/users/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": "audited_user",
                "email": "audit@example.com",
                "full_name": "Audited User",
                "password": "Password123!",
                "role_id": role_cajero_id,
            },
        )
        assert resp_create.status_code == 201
        user_id = resp_create.get_json()["id"]

        db.session.remove()
        log_create = AuditLog.query.filter_by(action="crear", entity_type="user", entity_id=user_id).first()
        assert log_create is not None
        assert log_create.details["new_value"]["username"] == "audited_user"

        # 2. Modificar usuario
        resp_update = client.patch(
            f"/api/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"full_name": "Audited User Renamed", "role_id": role_admin_id},
        )
        assert resp_update.status_code == 200

        db.session.remove()
        log_update = AuditLog.query.filter_by(action="editar", entity_type="user", entity_id=user_id).first()
        assert log_update is not None
        assert log_update.details["previous_value"]["full_name"] == "Audited User"
        assert log_update.details["new_value"]["full_name"] == "Audited User Renamed"

        # 3. Desactivar usuario
        resp_del = client.delete(
            f"/api/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp_del.status_code == 200

        db.session.remove()
        log_del = AuditLog.query.filter_by(action="desactivar", entity_type="user", entity_id=user_id).first()
        assert log_del is not None
        assert log_del.details["previous_value"]["is_active"] is True
        assert log_del.details["new_value"]["is_active"] is False

    def test_purchase_order_and_receive_audit_persists(
        self, client, admin_token, seed_admin, seed_product_for_sale, db
    ):
        """H-39: Órdenes de compra y recepciones deben auditarse."""
        from decimal import Decimal
        from app.services.purchase_order_service import PurchaseOrderService

        prod_id = seed_product_for_sale.id
        admin_id = seed_admin.id

        # 1. Crear orden
        order = PurchaseOrderService.create_order(
            user_id=admin_id,
            supplier_id=None,
            items=[{"product_id": prod_id, "quantity": "10", "unit_cost": "50.00"}],
            notes="OC Auditada",
        )
        order_id = order.id
        order_item_id = order.items[0].id

        db.session.remove()
        log_create = AuditLog.query.filter_by(
            action="crear", entity_type="purchase_order", entity_id=order_id
        ).first()
        assert log_create is not None
        assert log_create.details["folio"] is not None

        # 2. Enviar orden
        PurchaseOrderService.send_order(order_id)
        db.session.remove()
        log_send = AuditLog.query.filter_by(
            action="enviar", entity_type="purchase_order", entity_id=order_id
        ).first()
        assert log_send is not None

        # 3. Recibir orden
        PurchaseOrderService.receive_order(
            order_id=order_id,
            user_id=admin_id,
            items=[{"order_item_id": order_item_id, "received_quantity": "10"}],
        )
        db.session.remove()
        log_recv = AuditLog.query.filter_by(
            action="recibir", entity_type="purchase_order", entity_id=order_id
        ).first()
        assert log_recv is not None

    def test_supplier_audit_persists(self, client, admin_token, db):
        """H-39: Proveedores deben auditarse con valor anterior y nuevo."""
        resp_create = client.post(
            "/api/purchases/suppliers",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Proveedor Test S.A.", "contact_name": "Juan Perez"},
        )
        assert resp_create.status_code == 201
        supplier_id = resp_create.get_json()["id"]

        db.session.remove()
        log_create = AuditLog.query.filter_by(
            action="crear", entity_type="supplier", entity_id=supplier_id
        ).first()
        assert log_create is not None
        assert log_create.details["new_value"]["name"] == "Proveedor Test S.A."

        # Modificar proveedor
        resp_update = client.patch(
            f"/api/purchases/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"contact_name": "Juan Perez Modificado"},
        )
        assert resp_update.status_code == 200

        db.session.remove()
        log_update = AuditLog.query.filter_by(
            action="editar", entity_type="supplier", entity_id=supplier_id
        ).first()
        assert log_update is not None
        assert log_update.details["previous_value"]["contact_name"] == "Juan Perez"
        assert log_update.details["new_value"]["contact_name"] == "Juan Perez Modificado"

        # Desactivar proveedor
        resp_del = client.delete(
            f"/api/purchases/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp_del.status_code == 200

        db.session.remove()
        log_del = AuditLog.query.filter_by(
            action="desactivar", entity_type="supplier", entity_id=supplier_id
        ).first()
        assert log_del is not None
        assert log_del.details["previous_value"]["is_active"] is True
        assert log_del.details["new_value"]["is_active"] is False

    def test_product_category_and_unit_audit_persists(self, client, admin_token, db):
        """H-39: Categorías, unidades y productos auditados con valores anterior y nuevo."""
        # 1. Categoría
        resp_cat = client.post(
            "/api/categories/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Herramientas Auditadas"},
        )
        assert resp_cat.status_code == 201
        cat_id = resp_cat.get_json()["id"]

        db.session.remove()
        log_cat = AuditLog.query.filter_by(
            action="crear", entity_type="category", entity_id=cat_id
        ).first()
        assert log_cat is not None
        assert log_cat.details["new_value"]["name"] == "Herramientas Auditadas"

        # Editar categoría
        resp_cat_edit = client.patch(
            f"/api/categories/{cat_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Herramientas Renombradas"},
        )
        assert resp_cat_edit.status_code == 200

        db.session.remove()
        log_cat_edit = AuditLog.query.filter_by(
            action="editar", entity_type="category", entity_id=cat_id
        ).first()
        assert log_cat_edit is not None
        assert log_cat_edit.details["previous_value"]["name"] == "Herramientas Auditadas"
        assert log_cat_edit.details["new_value"]["name"] == "Herramientas Renombradas"

        # 2. Unidad de medida
        resp_unit = client.post(
            "/api/products/units",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Metro Auditado", "abbreviation": "ma"},
        )
        assert resp_unit.status_code == 201
        unit_id = resp_unit.get_json()["id"]

        db.session.remove()
        log_unit = AuditLog.query.filter_by(
            action="crear", entity_type="unit_of_measure", entity_id=unit_id
        ).first()
        assert log_unit is not None
        assert log_unit.details["new_value"]["name"] == "Metro Auditado"

        # 3. Producto
        resp_prod = client.post(
            "/api/products/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "sku": "PROD-AUDIT-1",
                "name": "Cinta Metrica",
                "category_id": cat_id,
                "unit_id": unit_id,
                "sale_price": "150.00",
                "avg_cost": "80.00",
                "tax_rate": "16.00",
            },
        )
        assert resp_prod.status_code == 201
        prod_id = resp_prod.get_json()["id"]

        db.session.remove()
        log_prod = AuditLog.query.filter_by(
            action="crear", entity_type="product", entity_id=prod_id
        ).first()
        assert log_prod is not None
        assert log_prod.details["new_value"]["name"] == "Cinta Metrica"

        # Editar producto
        resp_prod_edit = client.patch(
            f"/api/products/{prod_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Cinta Metrica 5m", "sale_price": "180.00"},
        )
        assert resp_prod_edit.status_code == 200

        db.session.remove()
        log_prod_edit = AuditLog.query.filter_by(
            action="editar", entity_type="product", entity_id=prod_id
        ).first()
        assert log_prod_edit is not None
        assert log_prod_edit.details["previous_value"]["sale_price"] == "150.00"
        assert log_prod_edit.details["new_value"]["sale_price"] == "180.00"

