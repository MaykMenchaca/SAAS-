"""Tests for purchase order CRUD (Task 28)."""
from decimal import Decimal

import pytest


@pytest.fixture
def seed_supplier(db):
    from app.models.purchase import Supplier
    supplier = Supplier(name="Truper SA", rfc="TRU1234567AB", is_active=True)
    db.session.add(supplier)
    db.session.flush()
    return supplier


@pytest.fixture
def seed_products_for_po(db):
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()

    p1 = Product(
        sku="PO-001",
        name="Martillo truper",
        unit_id=unit.id,
        sale_price=Decimal("199.00"),
        avg_cost=Decimal("80.00"),
        tax_rate=Decimal("16.00"),
    )
    p2 = Product(
        sku="PO-002",
        name="Desarmador truper",
        unit_id=unit.id,
        sale_price=Decimal("89.00"),
        avg_cost=Decimal("35.00"),
        tax_rate=Decimal("16.00"),
    )
    db.session.add_all([p1, p2])
    db.session.flush()
    return [p1, p2]


class TestCreateOrder:
    def test_create_order(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should create a purchase order in borrador status with correct totals."""
        p1, p2 = seed_products_for_po

        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [
                    {"product_id": p1.id, "quantity": "10", "unit_cost": "80.00"},
                    {"product_id": p2.id, "quantity": "20", "unit_cost": "35.00"},
                ],
                "notes": "Pedido mensual",
                "expected_date": "2026-06-15",
            },
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["status"] == "borrador"
        assert data["supplier_name"] == "Truper SA"
        assert data["notes"] == "Pedido mensual"
        assert data["expected_date"] == "2026-06-15"
        assert data["folio"].startswith("OC-")
        assert len(data["items"]) == 2

        # Verify totals: (10*80 + 20*35) = 800 + 700 = 1500 subtotal
        # Tax: 1500 * 0.16 = 240
        # Total: 1740
        assert Decimal(data["subtotal"]) == Decimal("1500.00")
        assert Decimal(data["tax_total"]) == Decimal("240.00")
        assert Decimal(data["total"]) == Decimal("1740.00")

    def test_create_order_requires_permission(self, client, regular_user_token, seed_supplier, seed_products_for_po):
        """Cajero should not be able to create purchase orders."""
        p1 = seed_products_for_po[0]
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        assert resp.status_code == 403

    def test_create_order_invalid_supplier(self, client, admin_token, seed_products_for_po):
        """Should fail with invalid supplier."""
        p1 = seed_products_for_po[0]
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": 9999,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        assert resp.status_code == 400
        assert "no encontrado" in resp.get_json()["error"]

    def test_create_order_invalid_product(self, client, admin_token, seed_supplier):
        """Should fail with invalid product."""
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": 9999, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        assert resp.status_code == 400
        assert "no encontrado" in resp.get_json()["error"]


class TestSendOrder:
    def test_send_order(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should mark a draft order as sent."""
        p1 = seed_products_for_po[0]
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        order_id = resp.get_json()["id"]

        resp = client.post(
            f"/api/purchases/orders/{order_id}/send",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "enviada"

    def test_cannot_send_non_draft(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should fail to send an already-sent order."""
        p1 = seed_products_for_po[0]
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        order_id = resp.get_json()["id"]

        client.post(
            f"/api/purchases/orders/{order_id}/send",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        resp = client.post(
            f"/api/purchases/orders/{order_id}/send",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400


class TestCancelOrder:
    def test_cancel_draft(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should cancel a draft order."""
        p1 = seed_products_for_po[0]
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        order_id = resp.get_json()["id"]

        resp = client.post(
            f"/api/purchases/orders/{order_id}/cancel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "cancelada"

    def test_cancel_sent(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should cancel a sent order."""
        p1 = seed_products_for_po[0]
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        order_id = resp.get_json()["id"]

        client.post(
            f"/api/purchases/orders/{order_id}/send",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        resp = client.post(
            f"/api/purchases/orders/{order_id}/cancel",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "cancelada"


class TestListAndDetail:
    def test_list_orders(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should list purchase orders with pagination."""
        p1 = seed_products_for_po[0]
        client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )

        resp = client.get(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total"] == 1
        assert data["items"][0]["supplier_name"] == "Truper SA"

    def test_list_orders_filter_status(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should filter orders by status."""
        p1 = seed_products_for_po[0]
        # Create two orders, send one
        resp1 = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "5", "unit_cost": "80.00"}],
            },
        )
        resp2 = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [{"product_id": p1.id, "quantity": "3", "unit_cost": "80.00"}],
            },
        )
        client.post(
            f"/api/purchases/orders/{resp1.get_json()['id']}/send",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # Filter by enviada
        resp = client.get(
            "/api/purchases/orders?status=enviada",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["total"] == 1

    def test_get_order_detail(self, client, admin_token, seed_supplier, seed_products_for_po):
        """Should return order with items."""
        p1, p2 = seed_products_for_po
        resp = client.post(
            "/api/purchases/orders",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "supplier_id": seed_supplier.id,
                "items": [
                    {"product_id": p1.id, "quantity": "10", "unit_cost": "80.00"},
                    {"product_id": p2.id, "quantity": "5", "unit_cost": "35.00"},
                ],
            },
        )
        order_id = resp.get_json()["id"]

        resp = client.get(
            f"/api/purchases/orders/{order_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["items"]) == 2
        assert data["items"][0]["product_name"] in ("Martillo truper", "Desarmador truper")

    def test_get_order_not_found(self, client, admin_token):
        """Should return 404 for non-existent order."""
        resp = client.get(
            "/api/purchases/orders/9999",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404
