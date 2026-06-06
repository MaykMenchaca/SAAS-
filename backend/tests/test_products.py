from decimal import Decimal


def test_create_product_with_category_and_unit(db):
    from app.models.product import Category, Product, UnitOfMeasure

    category = Category(name="Herramientas", description="Herramienta manual")
    unit = UnitOfMeasure(name="Pieza", abbreviation="pza", allows_fractions=False)
    db.session.add_all([category, unit])
    db.session.flush()

    product = Product(
        sku="MART-16",
        barcode="7501000000012",
        name="Martillo 16 oz",
        description="Mango antiderrapante",
        category_id=category.id,
        unit_id=unit.id,
        purchase_price=Decimal("80.50"),
        avg_cost=Decimal("78.25"),
        sale_price=Decimal("129.90"),
        tax_rate=Decimal("16.00"),
        min_stock=Decimal("2.000"),
        max_stock=Decimal("20.000"),
    )
    db.session.add(product)
    db.session.commit()

    assert product.id is not None
    assert product.category.name == "Herramientas"
    assert product.unit.abbreviation == "pza"
    assert product.purchase_price == Decimal("80.50")
    assert product.avg_cost == Decimal("78.25")
    assert product.min_stock == Decimal("2.000")
    assert product.is_active is True


def test_unit_of_measure_allows_fractional_products(db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Kilogramo", abbreviation="kg", allows_fractions=True)
    db.session.add(unit)
    db.session.commit()

    assert unit.id is not None
    assert unit.allows_fractions is True


def test_product_can_be_created_without_barcode_or_category(db):
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Servicio", abbreviation="srv", allows_fractions=False)
    db.session.add(unit)
    db.session.flush()

    product = Product(
        sku="SERV-001",
        name="Servicio de corte",
        unit_id=unit.id,
        sale_price=Decimal("25.00"),
    )
    db.session.add(product)
    db.session.commit()

    assert product.barcode is None
    assert product.category is None
    assert product.purchase_price == Decimal("0.00")
    assert product.avg_cost == Decimal("0.00")
    assert product.tax_rate == Decimal("16.00")
