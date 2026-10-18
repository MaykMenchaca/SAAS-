"""Tests for H-34: Test isolation, session boundaries, and explicit service rollbacks."""
from decimal import Decimal
import pytest

from app.extensions import db
from app.models.inventory import Stock
from app.models.product import Product
from app.models.purchase import PurchaseOrder, Supplier
from app.models.sale import Sale
from app.services.purchase_order_service import PurchaseOrderService
from app.services.sale_service import SaleService


def test_sale_creation_error_explicit_rollback(db, seed_admin, seed_open_session, seed_product_for_sale):
    """When sale creation fails (e.g. insufficient payment), all mutations roll back explicitly (H-34)."""
    prod_id = seed_product_for_sale.id
    session_id = seed_open_session.id
    user_id = seed_admin.id

    initial_stock = Stock.query.filter_by(product_id=prod_id).first().quantity
    initial_sales_count = Sale.query.count()

    with pytest.raises(ValueError, match="Pago insuficiente"):
        SaleService.create_sale(
            user_id=user_id,
            session_id=session_id,
            items=[{"product_id": prod_id, "quantity": "2"}],
            payments=[{"method": "efectivo", "amount": "10.00"}],  # total is 232.00
        )

    # Clean session verification
    db.session.remove()

    current_stock = Stock.query.filter_by(product_id=prod_id).first().quantity
    assert current_stock == initial_stock, "El stock no debe modificarse si la venta falla"
    assert Sale.query.count() == initial_sales_count, "No debe registrarse ninguna venta si falló"


def test_purchase_order_receive_error_explicit_rollback(db, seed_admin, seed_product_for_sale):
    """When order receiving fails midway, previous item movements roll back explicitly (H-34)."""
    prod1_id = seed_product_for_sale.id
    user_id = seed_admin.id

    supplier = Supplier(name="Proveedor Test H34", is_active=True)
    prod2 = Product(
        sku="POS-H34-2",
        name="Clavos H34",
        unit_id=seed_product_for_sale.unit_id,
        sale_price=Decimal("50.00"),
        avg_cost=Decimal("25.00"),
        tax_rate=Decimal("16.00"),
    )
    db.session.add_all([supplier, prod2])
    db.session.flush()
    stock2 = Stock(product_id=prod2.id, quantity=Decimal("10.000"))
    db.session.add(stock2)
    db.session.commit()

    order = PurchaseOrderService.create_order(
        user_id=user_id,
        supplier_id=supplier.id,
        items=[
            {"product_id": prod1_id, "quantity": "5", "unit_cost": "50.00"},
            {"product_id": prod2.id, "quantity": "10", "unit_cost": "20.00"},
        ],
    )
    PurchaseOrderService.send_order(order.id)
    order_id = order.id
    item0_id = order.items[0].id
    item1_id = order.items[1].id

    initial_stock1 = Stock.query.filter_by(product_id=prod1_id).first().quantity

    # Attempt to receive with item 1 valid, but item 2 exceeding remaining quantity
    with pytest.raises(ValueError, match="excede lo pendiente"):
        PurchaseOrderService.receive_order(
            order_id=order_id,
            user_id=user_id,
            items=[
                {"order_item_id": item0_id, "received_quantity": "5"},
                {"order_item_id": item1_id, "received_quantity": "999"},  # Invalid!
            ],
        )

    db.session.remove()

    current_stock1 = Stock.query.filter_by(product_id=prod1_id).first().quantity
    assert current_stock1 == initial_stock1, "El stock del item 1 no debe haber aumentado"

    reloaded_order = db.session.get(PurchaseOrder, order_id)
    assert reloaded_order.status == "enviada", "La orden no debe quedar en estado parcial"


def test_client_request_isolation_between_calls(client, admin_token, seed_open_session, seed_product_for_sale, db):
    """Client requests do not leak cached session data or dirty state across calls (H-34)."""
    prod_id = seed_product_for_sale.id
    session_id = seed_open_session.id

    # 1. Update product price directly in DB
    seed_product_for_sale.sale_price = Decimal("250.00")
    db.session.commit()

    # 2. Quote pricing via API
    quote_resp = client.post(
        "/api/sales/quote",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": session_id,
            "items": [{"product_id": prod_id, "quantity": 1}],
        },
    )
    assert quote_resp.status_code == 200
    data = quote_resp.get_json()
    assert Decimal(data["lines"][0]["unit_price"]) == Decimal("250.00")

    # 3. Direct modification again
    p = db.session.get(Product, prod_id)
    p.sale_price = Decimal("300.00")
    db.session.commit()

    quote_resp2 = client.post(
        "/api/sales/quote",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": session_id,
            "items": [{"product_id": prod_id, "quantity": 1}],
        },
    )
    assert quote_resp2.status_code == 200
    data2 = quote_resp2.get_json()
    assert Decimal(data2["lines"][0]["unit_price"]) == Decimal("300.00"), "Debe reflejar el cambio en BD sin caché de sesión"
