from decimal import Decimal


def test_admin_can_create_category(client, admin_token):
    response = client.post(
        "/api/categories/",
        json={"name": "Herramientas", "description": "Herramienta manual"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "Herramientas"
    assert data["is_active"] is True


def test_admin_can_create_product(client, admin_token, db):
    from app.models.product import Category, UnitOfMeasure

    category = Category(name="Plomeria")
    unit = UnitOfMeasure(name="Pieza", abbreviation="pza")
    db.session.add_all([category, unit])
    db.session.flush()

    response = client.post(
        "/api/products/",
        json={
            "sku": "LLAVE-001",
            "barcode": "7501000000029",
            "name": "Llave mezcladora",
            "description": "Cromada",
            "category_id": category.id,
            "unit_id": unit.id,
            "purchase_price": "90.50",
            "avg_cost": "88.00",
            "sale_price": "149.90",
            "tax_rate": "16.00",
            "min_stock": "1.000",
            "max_stock": "10.000",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["sku"] == "LLAVE-001"
    assert data["category"]["name"] == "Plomeria"
    assert data["unit"]["abbreviation"] == "pza"
    assert data["sale_price"] == "149.90"
    assert data["min_stock"] == "1.000"


def test_admin_can_list_and_search_products(client, admin_token, db):
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pza")
    db.session.add(unit)
    db.session.flush()
    db.session.add_all(
        [
            Product(sku="MART-16", name="Martillo 16 oz", unit_id=unit.id, sale_price=Decimal("129.90")),
            Product(sku="CLAV-01", name="Clavo acero", unit_id=unit.id, sale_price=Decimal("1.50")),
        ]
    )
    db.session.commit()

    response = client.get(
        "/api/products/?search=mart",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 1
    assert data["items"][0]["sku"] == "MART-16"


def test_admin_can_update_product(client, admin_token, db):
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pza")
    db.session.add(unit)
    db.session.flush()
    product = Product(
        sku="PIN-001",
        name="Pintura blanca",
        unit_id=unit.id,
        sale_price=Decimal("200.00"),
    )
    db.session.add(product)
    db.session.commit()

    response = client.patch(
        f"/api/products/{product.id}",
        json={"name": "Pintura blanca 1L", "sale_price": "220.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["name"] == "Pintura blanca 1L"
    assert data["sale_price"] == "220.00"


def test_admin_can_deactivate_product(client, admin_token, db):
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pza")
    db.session.add(unit)
    db.session.flush()
    product = Product(
        sku="OLD-001",
        name="Producto viejo",
        unit_id=unit.id,
        sale_price=Decimal("10.00"),
    )
    db.session.add(product)
    db.session.commit()

    response = client.delete(
        f"/api/products/{product.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.get_json()["is_active"] is False


def test_create_product_requires_permission(client, regular_user_token, db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pza")
    db.session.add(unit)
    db.session.flush()

    response = client.post(
        "/api/products/",
        json={
            "sku": "NOPE-001",
            "name": "No permitido",
            "unit_id": unit.id,
            "sale_price": "10.00",
        },
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )

    assert response.status_code == 403


def test_create_product_validates_duplicate_sku(client, admin_token, db):
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pza")
    db.session.add(unit)
    db.session.flush()
    db.session.add(Product(sku="DUP-001", name="Original", unit_id=unit.id, sale_price=Decimal("10.00")))
    db.session.commit()

    response = client.post(
        "/api/products/",
        json={
            "sku": "DUP-001",
            "name": "Duplicado",
            "unit_id": unit.id,
            "sale_price": "15.00",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422


def test_admin_can_update_category(client, admin_token, db):
    from app.models.product import Category

    category = Category(name="Temporal")
    db.session.add(category)
    db.session.commit()

    response = client.patch(
        f"/api/categories/{category.id}",
        json={"name": "Ferreteria"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.get_json()["name"] == "Ferreteria"


def test_admin_can_list_and_deactivate_category(client, admin_token, db):
    from app.models.product import Category

    category = Category(name="Pinturas")
    db.session.add(category)
    db.session.commit()

    list_response = client.get(
        "/api/categories/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert list_response.status_code == 200
    assert list_response.get_json()["total"] == 1

    delete_response = client.delete(
        f"/api/categories/{category.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert delete_response.status_code == 200
    assert delete_response.get_json()["is_active"] is False


def test_admin_can_create_unit(client, admin_token):
    response = client.post(
        "/api/products/units",
        json={"name": "Kilo", "abbreviation": "kg", "allows_fractions": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "Kilo"
    assert data["abbreviation"] == "kg"
    assert data["allows_fractions"] is True


def test_admin_can_update_unit(client, admin_token, db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Metro", abbreviation="m")
    db.session.add(unit)
    db.session.commit()

    response = client.patch(
        f"/api/products/units/{unit.id}",
        json={"name": "Metro lineal", "abbreviation": "ml"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["name"] == "Metro lineal"
    assert data["abbreviation"] == "ml"


def test_admin_can_delete_unit(client, admin_token, db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Rollo", abbreviation="rl")
    db.session.add(unit)
    db.session.commit()

    response = client.delete(
        f"/api/products/units/{unit.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.get_json()["success"] is True


def test_cannot_delete_unit_in_use(client, admin_token, db):
    from app.models.product import UnitOfMeasure, Product

    unit = UnitOfMeasure(name="Caja", abbreviation="cj")
    db.session.add(unit)
    db.session.flush()
    product = Product(sku="BOX-01", name="Caja clavos", unit_id=unit.id, sale_price=Decimal("50.00"))
    db.session.add(product)
    db.session.commit()

    response = client.delete(
        f"/api/products/units/{unit.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422
    assert "error" in response.get_json()
