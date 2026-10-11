"""Tests for inventory API endpoints (Task 16)."""
from decimal import Decimal


def _seed_product_with_stock(db):
    """Helper: create a product with stock for API testing."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.inventory import Stock

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()

    product = Product(
        sku="API-001",
        name="Martillo de bola",
        unit_id=unit.id,
        sale_price=Decimal("149.90"),
        min_stock=Decimal("10.000"),
        max_stock=Decimal("200.000"),
    )
    db.session.add(product)
    db.session.flush()

    stock = Stock(product_id=product.id, quantity=Decimal("75.000"))
    db.session.add(stock)
    db.session.flush()

    return product


def _seed_multiple_products(db):
    """Helper: create multiple products with varying stock levels."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.inventory import Stock

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()

    products = []
    stock_data = [
        ("MULTI-001", "Clavos 2in", Decimal("100.000"), Decimal("10.000")),
        ("MULTI-002", "Tornillos", Decimal("5.000"), Decimal("20.000")),  # below min_stock
        ("MULTI-003", "Tuercas", Decimal("0.000"), Decimal("15.000")),  # zero stock
        ("MULTI-004", "Arandelas", Decimal("50.000"), Decimal("5.000")),
    ]

    for sku, name, qty, min_s in stock_data:
        product = Product(
            sku=sku,
            name=name,
            unit_id=unit.id,
            sale_price=Decimal("10.00"),
            min_stock=min_s,
        )
        db.session.add(product)
        db.session.flush()

        stock = Stock(product_id=product.id, quantity=qty)
        db.session.add(stock)
        products.append(product)

    db.session.flush()
    return products


# --- Stock listing ---


def test_admin_can_list_stock(client, admin_token, db):
    _seed_product_with_stock(db)

    response = client.get(
        "/api/inventory/stock",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert "items" in data
    assert len(data["items"]) >= 1
    item = data["items"][0]
    assert "product_name" in item
    assert "quantity" in item
    assert "sku" in item


def test_stock_list_requires_permission(client, db):
    """Unauthenticated request should fail."""
    response = client.get("/api/inventory/stock")
    assert response.status_code == 401


def test_admin_can_get_stock_by_product(client, admin_token, db):
    product = _seed_product_with_stock(db)

    response = client.get(
        f"/api/inventory/stock/{product.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["quantity"] == "75.000"
    assert data["product_name"] == "Martillo de bola"


def test_get_stock_nonexistent_product(client, admin_token, db):
    response = client.get(
        "/api/inventory/stock/9999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 404


def test_stock_list_search_by_name(client, admin_token, db):
    _seed_multiple_products(db)

    response = client.get(
        "/api/inventory/stock?search=Tornillos",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["items"]) == 1
    assert data["items"][0]["product_name"] == "Tornillos"


# --- Low stock alerts ---


def test_admin_can_get_low_stock(client, admin_token, db):
    _seed_multiple_products(db)

    response = client.get(
        "/api/inventory/low-stock",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()["items"]  # paginado desde la 6.4
    # MULTI-002 (5 < 20) and MULTI-003 (0 < 15) should appear
    assert len(data) == 2
    names = [item["product_name"] for item in data]
    assert "Tornillos" in names
    assert "Tuercas" in names


# --- Manual adjustment ---


def test_admin_can_adjust_stock(client, admin_token, db):
    product = _seed_product_with_stock(db)

    response = client.post(
        "/api/inventory/adjust",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "product_id": product.id,
            "quantity": "42.000",
            "notes": "Resultado de conteo fisico",
        },
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["new_stock"] == "42.000"
    assert data["movement_type"] == "ajuste"


def test_adjust_stock_requires_permission(client, regular_user_token, db):
    product = _seed_product_with_stock(db)

    response = client.post(
        "/api/inventory/adjust",
        headers={"Authorization": f"Bearer {regular_user_token}"},
        json={
            "product_id": product.id,
            "quantity": "42.000",
        },
    )
    assert response.status_code == 403


def test_adjust_stock_validates_product_exists(client, admin_token, db):
    response = client.post(
        "/api/inventory/adjust",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "product_id": 9999,
            "quantity": "10.000",
        },
    )
    assert response.status_code == 404


# --- Movement history ---


def test_admin_can_list_movements(client, admin_token, db):
    product = _seed_product_with_stock(db)

    # Create a movement via adjustment
    client.post(
        "/api/inventory/adjust",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"product_id": product.id, "quantity": "60.000", "notes": "Ajuste test"},
    )

    response = client.get(
        f"/api/inventory/movements/{product.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) >= 1
    movement = data[0]
    assert "movement_type" in movement
    assert "quantity" in movement
    assert "previous_stock" in movement
    assert "new_stock" in movement
    assert "created_at" in movement
