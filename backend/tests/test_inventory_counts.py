"""Tests for physical inventory count (Task 24)."""
from decimal import Decimal

import pytest


@pytest.fixture
def seed_products_with_stock(db):
    """Create two active products with stock for count tests."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.inventory import Stock

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()

    p1 = Product(
        sku="CNT-001",
        name="Tornillo 1/4",
        unit_id=unit.id,
        sale_price=Decimal("5.00"),
        avg_cost=Decimal("2.00"),
        tax_rate=Decimal("16.00"),
    )
    p2 = Product(
        sku="CNT-002",
        name="Clavo 2 pulgadas",
        unit_id=unit.id,
        sale_price=Decimal("3.00"),
        avg_cost=Decimal("1.00"),
        tax_rate=Decimal("16.00"),
    )
    db.session.add_all([p1, p2])
    db.session.flush()

    s1 = Stock(product_id=p1.id, quantity=Decimal("100.000"))
    s2 = Stock(product_id=p2.id, quantity=Decimal("200.000"))
    db.session.add_all([s1, s2])
    db.session.flush()
    return [p1, p2]


class TestCreateCount:
    def test_create_count_populates_items(self, client, admin_token, seed_products_with_stock):
        """Creating a count should pre-populate items for all active products with stock."""
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"notes": "Conteo mensual junio"},
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["status"] == "pendiente"
        assert data["notes"] == "Conteo mensual junio"
        assert data["total_items"] == 2
        assert data["counted_items"] == 0

        # Items should have expected quantities matching stock
        items = data["items"]
        expected_qtys = {i["product_id"]: Decimal(i["expected_quantity"]) for i in items}
        p1, p2 = seed_products_with_stock
        assert expected_qtys[p1.id] == Decimal("100.000")
        assert expected_qtys[p2.id] == Decimal("200.000")

    def test_cannot_create_count_while_active(self, client, admin_token, seed_products_with_stock):
        """Should not allow creating a second count while one is active."""
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        assert resp.status_code == 201

        resp2 = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        assert resp2.status_code == 400
        assert "Ya existe un conteo" in resp2.get_json()["error"]

    def test_create_count_requires_permission(self, client, regular_user_token, seed_products_with_stock):
        """Cajero without inventario:ajustar should be denied."""
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            json={},
        )
        assert resp.status_code == 403


class TestCaptureItem:
    def test_capture_sets_counted_and_difference(self, client, admin_token, seed_products_with_stock):
        """Capturing a count should set counted_quantity and calculate difference."""
        p1 = seed_products_with_stock[0]

        # Create count
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        # Capture item — physical count is 95 vs expected 100
        resp = client.patch(
            f"/api/inventory/counts/{count_id}/items/{p1.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "95.000"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert Decimal(data["counted_quantity"]) == Decimal("95.000")
        assert Decimal(data["difference"]) == Decimal("-5.000")

    def test_capture_moves_status_to_en_proceso(self, client, admin_token, seed_products_with_stock):
        """First capture should change count status from pendiente to en_proceso."""
        p1 = seed_products_with_stock[0]

        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]
        assert resp.get_json()["status"] == "pendiente"

        client.patch(
            f"/api/inventory/counts/{count_id}/items/{p1.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "100.000"},
        )

        # Check count status
        resp = client.get(
            f"/api/inventory/counts/{count_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.get_json()["status"] == "en_proceso"

    def test_capture_invalid_product(self, client, admin_token, seed_products_with_stock):
        """Capturing a product not in the count should fail."""
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        resp = client.patch(
            f"/api/inventory/counts/{count_id}/items/9999",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "10.000"},
        )
        assert resp.status_code == 400
        assert "no encontrado" in resp.get_json()["error"]


class TestCloseCount:
    def test_close_adjusts_stock(self, client, admin_token, db, seed_products_with_stock):
        """Closing a count should auto-adjust stock for counted items with differences."""
        from app.models.inventory import Stock

        p1, p2 = seed_products_with_stock

        # Create count
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        # Capture: p1 has 95 (expected 100), p2 has 210 (expected 200)
        client.patch(
            f"/api/inventory/counts/{count_id}/items/{p1.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "95.000"},
        )
        client.patch(
            f"/api/inventory/counts/{count_id}/items/{p2.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "210.000"},
        )

        # Close
        resp = client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "cerrado"
        assert data["closed_at"] is not None

        # Verify stock was adjusted
        s1 = Stock.query.filter_by(product_id=p1.id).first()
        s2 = Stock.query.filter_by(product_id=p2.id).first()
        assert s1.quantity == Decimal("95.000")
        assert s2.quantity == Decimal("210.000")

    def test_close_skips_uncounted_items(self, client, admin_token, db, seed_products_with_stock):
        """Closing should not adjust stock for items that were not counted."""
        from app.models.inventory import Stock

        p1, p2 = seed_products_with_stock

        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        # Only count p1
        client.patch(
            f"/api/inventory/counts/{count_id}/items/{p1.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "90.000"},
        )

        # Close
        resp = client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200

        # p1 should be adjusted, p2 should remain unchanged
        s1 = Stock.query.filter_by(product_id=p1.id).first()
        s2 = Stock.query.filter_by(product_id=p2.id).first()
        assert s1.quantity == Decimal("90.000")
        assert s2.quantity == Decimal("200.000")

    def test_close_no_adjustment_when_match(self, client, admin_token, db, seed_products_with_stock):
        """Items counted with same quantity as expected should not generate movements."""
        from app.models.inventory import StockMovement

        p1 = seed_products_with_stock[0]

        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        # Count matches expected
        client.patch(
            f"/api/inventory/counts/{count_id}/items/{p1.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "100.000"},
        )

        # Close
        client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # No adjustment movement should be created for this product (count ref)
        movements = StockMovement.query.filter_by(
            product_id=p1.id, reference_type="conteo"
        ).all()
        assert len(movements) == 0

    def test_cannot_close_already_closed(self, client, admin_token, seed_products_with_stock):
        """Closing an already-closed count should fail."""
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        resp = client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400
        assert "cerrado o cancelado" in resp.get_json()["error"]

    def test_close_adjusts_stock_by_difference_preserving_intermediate_sales(
        self, client, admin_token, db, seed_admin, seed_products_with_stock
    ):
        """H-20: Closing a count must apply adjustments as differences (counted - expected),
        preserving any sales or inventory changes made between count capture and count closing.
        """
        from app.models.inventory import Stock, StockMovement
        from app.services.inventory_service import InventoryService

        p1 = seed_products_with_stock[0]  # Initial stock = 100.000

        # 1. Create count session (expected = 100.000)
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        # 2. Capture physical count: found 95 items (difference = -5.000)
        resp_cap = client.patch(
            f"/api/inventory/counts/{count_id}/items/{p1.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "95.000"},
        )
        assert resp_cap.status_code == 200
        assert resp_cap.get_json()["difference"] == "-5.000"

        # 3. Intermediate sale occurs before count is closed: 10 units sold
        # Stock drops from 100.000 to 90.000
        InventoryService.move_stock(
            product_id=p1.id,
            quantity=Decimal("10.000"),
            movement_type="salida",
            reference_type="venta",
            reference_id=999,
            user_id=seed_admin.id,
            notes="Venta intermedia durante el conteo",
        )
        db.session.commit()

        s_intermediate = Stock.query.filter_by(product_id=p1.id).first()
        assert s_intermediate.quantity == Decimal("90.000")

        # 4. Close the count session
        resp_close = client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp_close.status_code == 200

        # 5. Verify final stock: 90.000 + (-5.000) = 85.000 (NOT reset to 95.000!)
        s_final = Stock.query.filter_by(product_id=p1.id).first()
        assert s_final.quantity == Decimal("85.000")

        # 6. Verify StockMovement audit trail
        m = (
            StockMovement.query
            .filter_by(product_id=p1.id, reference_type="conteo", reference_id=count_id)
            .first()
        )
        assert m is not None
        assert m.movement_type == "ajuste"
        assert m.quantity == Decimal("5.000")
        assert m.previous_stock == Decimal("90.000")
        assert m.new_stock == Decimal("85.000")


class TestCancelCount:
    def test_cancel_does_not_adjust_stock(self, client, admin_token, db, seed_products_with_stock):
        """Cancelling should not apply any stock adjustments."""
        from app.models.inventory import Stock

        p1 = seed_products_with_stock[0]

        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        # Capture a difference
        client.patch(
            f"/api/inventory/counts/{count_id}/items/{p1.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "50.000"},
        )

        # Cancel instead of close
        resp = client.post(
            f"/api/inventory/counts/{count_id}/cancel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "cancelado"

        # Stock should remain unchanged
        s1 = Stock.query.filter_by(product_id=p1.id).first()
        assert s1.quantity == Decimal("100.000")


class TestListAndDetailCounts:
    def test_list_counts(self, client, admin_token, seed_products_with_stock):
        """List counts should return paginated results."""
        # Create and close a count
        client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"notes": "Conteo 1"},
        )

        resp = client.get(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total"] == 1
        assert data["items"][0]["notes"] == "Conteo 1"
        assert data["items"][0]["total_items"] == 2

    def test_get_count_detail(self, client, admin_token, seed_products_with_stock):
        """Get count detail should include all items."""
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        resp = client.get(
            f"/api/inventory/counts/{count_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["items"]) == 2
        assert all(i["counted_quantity"] is None for i in data["items"])

    def test_get_count_not_found(self, client, admin_token):
        """Getting a non-existent count should return 404."""
        resp = client.get(
            "/api/inventory/counts/9999",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404


class TestAfterClosedNewCountAllowed:
    def test_can_create_after_close(self, client, admin_token, seed_products_with_stock):
        """After closing a count, a new one should be allowed."""
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        count_id = resp.get_json()["id"]

        client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # Should be able to create a new one
        resp = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
        )
        assert resp.status_code == 201


class TestInventoryCountConstraints:
    def test_inventory_count_item_unique_constraint(self, db, seed_admin, seed_products_with_stock):
        """H-20: InventoryCountItem must enforce unique constraint on (inventory_count_id, product_id)."""
        from sqlalchemy.exc import IntegrityError
        from app.models.inventory import InventoryCount, InventoryCountItem

        p1 = seed_products_with_stock[0]

        count = InventoryCount(user_id=seed_admin.id, status="pendiente")
        db.session.add(count)
        db.session.flush()

        item1 = InventoryCountItem(
            inventory_count_id=count.id,
            product_id=p1.id,
            expected_quantity=Decimal("100.000"),
        )
        db.session.add(item1)
        db.session.commit()

        # Attempt to add a duplicate item for the same product in the same count
        item2 = InventoryCountItem(
            inventory_count_id=count.id,
            product_id=p1.id,
            expected_quantity=Decimal("100.000"),
        )
        db.session.add(item2)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

