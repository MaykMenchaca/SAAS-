"""End-to-end workflow tests.

These tests exercise full business scenarios through the API layer,
verifying that different modules integrate correctly across the system.
"""
from decimal import Decimal

from app.models.audit import AuditLog
from app.models.inventory import Stock, StockMovement
from app.models.sale import Sale


class TestSaleWorkflow:
    """Full POS sale workflow: login → open session → sell → close session."""

    def test_complete_sale_cycle(
        self, client, db, seed_admin, seed_cash_register, seed_product_for_sale, seed_roles
    ):
        """Complete POS cycle: login → open cash → create sale → close cash."""
        # 1. Login
        login_resp = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123",
        })
        assert login_resp.status_code == 200
        token = login_resp.get_json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Open cash register session
        open_resp = client.post("/api/cash-register/open", json={
            "cash_register_id": seed_cash_register.id,
            "opening_amount": "500.00",
        }, headers=headers)
        assert open_resp.status_code == 201
        session_id = open_resp.get_json()["id"]

        # 3. Create a sale
        sale_resp = client.post("/api/sales/", json={
            "session_id": session_id,
            "items": [{
                "product_id": seed_product_for_sale.id,
                "quantity": 3,
            }],
            "payments": [{"method": "efectivo", "amount": "348.00"}],
        }, headers=headers)
        assert sale_resp.status_code == 201
        sale_data = sale_resp.get_json()
        assert sale_data["folio"].startswith("V-")
        assert sale_data["status"] == "completada"

        # 4. Verify stock was reduced
        stock = Stock.query.filter_by(product_id=seed_product_for_sale.id).first()
        assert stock.quantity == Decimal("97.000")  # 100 - 3

        # 5. Verify stock movements were created
        movements = StockMovement.query.filter_by(
            product_id=seed_product_for_sale.id,
            reference_type="venta",
        ).all()
        assert len(movements) == 1
        assert movements[0].movement_type == "salida"

        # 6. Close cash register session
        close_resp = client.post(
            f"/api/cash-register/{session_id}/close",
            json={"closing_amount": "848.00"},
            headers=headers,
        )
        assert close_resp.status_code == 200

        # 7. Verify dashboard reflects the sale
        dash_resp = client.get("/api/reports/dashboard", headers=headers)
        assert dash_resp.status_code == 200
        dash_data = dash_resp.get_json()
        assert dash_data["sales_today"] >= 1
        assert float(dash_data["revenue_today"]) > 0

        # 8. Verify audit log captured the login and sale
        audit_entries = AuditLog.query.filter_by(action="login").count()
        assert audit_entries >= 1
        sale_entries = AuditLog.query.filter_by(
            action="create", entity_type="sale"
        ).count()
        assert sale_entries == 1


class TestSaleReturnWorkflow:
    """Full sale return workflow: sell → return items → verify inventory restored."""

    def test_sale_and_partial_return(
        self, client, admin_token, db, seed_open_session, seed_product_for_sale
    ):
        """Create sale then partially return items."""
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Create sale of 5 units
        sale_resp = client.post("/api/sales/", json={
            "session_id": seed_open_session.id,
            "items": [{
                "product_id": seed_product_for_sale.id,
                "quantity": 5,
                "unit_price": "100.00",
                "tax_rate": "16.00",
            }],
            "payments": [{"method": "efectivo", "amount": "580.00"}],
        }, headers=headers)
        assert sale_resp.status_code == 201
        sale_id = sale_resp.get_json()["id"]

        # Stock should be 95
        stock = Stock.query.filter_by(product_id=seed_product_for_sale.id).first()
        assert stock.quantity == Decimal("95.000")

        # 2. Get sale details to find sale_item_id
        detail_resp = client.get(f"/api/sales/{sale_id}", headers=headers)
        sale_item_id = detail_resp.get_json()["items"][0]["id"]

        # 3. Return 2 units
        return_resp = client.post(f"/api/sales/{sale_id}/return", json={
            "reason": "Producto defectuoso",
            "items": [{"sale_item_id": sale_item_id, "quantity": 2}],
        }, headers=headers)
        assert return_resp.status_code == 200

        # 4. Verify stock was restored (95 + 2 = 97)
        db.session.expire_all()
        stock = Stock.query.filter_by(product_id=seed_product_for_sale.id).first()
        assert stock.quantity == Decimal("97.000")

        # 5. Verify sale status changed
        sale = db.session.get(Sale, sale_id)
        assert sale.status == "devolucion_parcial"


class TestPurchaseOrderWorkflow:
    """Full purchase order workflow: create → send → receive → verify inventory."""

    def test_full_purchase_order_cycle(
        self, client, admin_token, db, seed_product_for_sale
    ):
        """Create PO → send → receive items → verify stock increased."""
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Create a supplier
        supplier_resp = client.post("/api/purchases/suppliers", json={
            "name": "Proveedor E2E",
            "contact_name": "Juan",
            "phone": "555-0001",
        }, headers=headers)
        assert supplier_resp.status_code == 201
        supplier_id = supplier_resp.get_json()["id"]

        # 2. Create purchase order
        po_resp = client.post("/api/purchases/orders", json={
            "supplier_id": supplier_id,
            "items": [{
                "product_id": seed_product_for_sale.id,
                "quantity": 50,
                "unit_cost": "55.00",
                "tax_rate": "16.00",
            }],
        }, headers=headers)
        assert po_resp.status_code == 201
        po_data = po_resp.get_json()
        order_id = po_data["id"]
        assert po_data["status"] == "borrador"

        # 3. Send order
        send_resp = client.post(
            f"/api/purchases/orders/{order_id}/send", headers=headers
        )
        assert send_resp.status_code == 200
        assert send_resp.get_json()["status"] == "enviada"

        # 3b. Get order detail to find order_item_id
        detail_resp = client.get(
            f"/api/purchases/orders/{order_id}", headers=headers
        )
        order_item_id = detail_resp.get_json()["items"][0]["id"]

        # 4. Receive full order
        receive_resp = client.post(
            f"/api/purchases/orders/{order_id}/receive",
            json={
                "items": [{
                    "order_item_id": order_item_id,
                    "received_quantity": "50",
                }],
            },
            headers=headers,
        )
        assert receive_resp.status_code == 200
        assert receive_resp.get_json()["status"] == "recibida"

        # 5. Verify stock increased (100 + 50 = 150)
        db.session.expire_all()
        stock = Stock.query.filter_by(product_id=seed_product_for_sale.id).first()
        assert stock.quantity == Decimal("150.000")

        # 6. Verify avg_cost was updated
        # Old: 100*60 = 6000, New: 50*55 = 2750, Total: 8750/150 ≈ 58.33
        from app.models.product import Product
        product = db.session.get(Product, seed_product_for_sale.id)
        assert product.avg_cost == Decimal("58.3333")  # 4 decimales desde la fase 4.6 (H-31)


class TestInventoryCountWorkflow:
    """Full inventory count workflow: create → count → close → verify adjustments."""

    def test_inventory_count_with_discrepancy(
        self, client, admin_token, db, seed_product_for_sale
    ):
        """Count finds less stock than expected → adjustment on close."""
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Current stock = 100
        stock_before = Stock.query.filter_by(
            product_id=seed_product_for_sale.id
        ).first()
        assert stock_before.quantity == Decimal("100.000")

        # 1. Create inventory count
        create_resp = client.post(
            "/api/inventory/counts", json={}, headers=headers
        )
        assert create_resp.status_code == 201
        count_id = create_resp.get_json()["id"]

        # 2. Capture counted quantity (found 95, expected 100)
        capture_resp = client.patch(
            f"/api/inventory/counts/{count_id}/items/{seed_product_for_sale.id}",
            json={"counted_quantity": "95.000"},
            headers=headers,
        )
        assert capture_resp.status_code == 200

        # 3. Close the count (should auto-adjust -5)
        close_resp = client.post(
            f"/api/inventory/counts/{count_id}/close",
            json={},
            headers=headers,
        )
        assert close_resp.status_code == 200

        # 4. Verify stock was adjusted to 95
        db.session.expire_all()
        stock_after = Stock.query.filter_by(
            product_id=seed_product_for_sale.id
        ).first()
        assert stock_after.quantity == Decimal("95.000")

        # 5. Verify adjustment movement was recorded
        adjustment = StockMovement.query.filter_by(
            reference_type="conteo",
            product_id=seed_product_for_sale.id,
        ).first()
        assert adjustment is not None
        assert adjustment.movement_type == "ajuste"


class TestReportsWorkflow:
    """Reports accurately reflect business activity."""

    def test_reports_after_sales(
        self, client, admin_token, db, seed_open_session, seed_product_for_sale
    ):
        """Verify all reports reflect data after a sale."""
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Create a sale
        client.post("/api/sales/", json={
            "session_id": seed_open_session.id,
            "items": [{
                "product_id": seed_product_for_sale.id,
                "quantity": 10,
                "unit_price": "100.00",
                "tax_rate": "16.00",
            }],
            "payments": [{"method": "efectivo", "amount": "1160.00"}],
        }, headers=headers)

        # Sales report
        sales_resp = client.get("/api/reports/sales", headers=headers)
        assert sales_resp.status_code == 200
        assert sales_resp.get_json()["total_sales"] == 1

        # Top products
        top_resp = client.get("/api/reports/top-products", headers=headers)
        assert top_resp.status_code == 200
        items = top_resp.get_json()["items"]
        assert len(items) == 1
        assert items[0]["product_name"] == "Martillo"

        # Inventory valuation (90 units left at avg_cost 60)
        val_resp = client.get("/api/reports/inventory-valuation", headers=headers)
        assert val_resp.status_code == 200
        val_data = val_resp.get_json()
        assert val_data["product_count"] == 1
        assert val_data["items"][0]["quantity"] == "90.000"

        # Gross margin (revenue=1000, cost=10*60=600, margin=400)
        margin_resp = client.get("/api/reports/gross-margin", headers=headers)
        assert margin_resp.status_code == 200
        margin_data = margin_resp.get_json()
        assert margin_data["summary"]["total_revenue"] == "1000.00"
        assert margin_data["summary"]["total_cost"] == "600.00"
        assert margin_data["summary"]["gross_margin"] == "400.00"


class TestConfigAndAuditWorkflow:
    """Config changes and audit trail integration."""

    def test_config_update_audited(self, client, admin_token, db):
        """Updating config should create audit log entries."""
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Update config
        client.put("/api/config/", json={
            "company_name": "E2E Test Store",
        }, headers=headers)

        # Verify config was updated
        config_resp = client.get("/api/config/", headers=headers)
        assert config_resp.get_json()["company_name"] == "E2E Test Store"

        # Verify audit log captured it
        audit_resp = client.get(
            "/api/audit/?action=update&entity_type=config",
            headers=headers,
        )
        assert audit_resp.status_code == 200
        audit_data = audit_resp.get_json()
        assert audit_data["total"] >= 1
