"""Tests for inventory models (Task 14) and inventory service (Task 15)."""
from decimal import Decimal


# --- Model Tests (Task 14) ---


def test_create_stock_for_product(db):
    """Stock record links to a product and defaults to quantity 0."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.inventory import Stock

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()

    product = Product(
        sku="INV-001",
        name="Martillo",
        unit_id=unit.id,
        sale_price=Decimal("149.90"),
    )
    db.session.add(product)
    db.session.flush()

    stock = Stock(product_id=product.id, quantity=Decimal("100.000"))
    db.session.add(stock)
    db.session.commit()

    assert stock.id is not None
    assert stock.quantity == Decimal("100.000")
    assert stock.product.name == "Martillo"


def test_stock_movement_records_history(db):
    """StockMovement records movement details with previous/new stock."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.user import User, Role
    from app.models.inventory import Stock, StockMovement

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    role = Role(name="admin", description="Admin")
    db.session.add_all([unit, role])
    db.session.flush()

    user = User(
        username="testuser",
        email="test@test.com",
        full_name="Test User",
        role_id=role.id,
    )
    user.set_password("pass123")
    product = Product(
        sku="INV-002",
        name="Destornillador",
        unit_id=unit.id,
        sale_price=Decimal("59.90"),
    )
    db.session.add_all([user, product])
    db.session.flush()

    stock = Stock(product_id=product.id, quantity=Decimal("50.000"))
    db.session.add(stock)
    db.session.flush()

    movement = StockMovement(
        product_id=product.id,
        movement_type="entrada",
        quantity=Decimal("20.000"),
        previous_stock=Decimal("50.000"),
        new_stock=Decimal("70.000"),
        reference_type="compra",
        reference_id=1,
        user_id=user.id,
        notes="Compra inicial",
    )
    db.session.add(movement)
    db.session.commit()

    assert movement.id is not None
    assert movement.previous_stock == Decimal("50.000")
    assert movement.new_stock == Decimal("70.000")
    assert movement.movement_type == "entrada"
    assert movement.product.name == "Destornillador"
    assert movement.user.username == "testuser"


def test_stock_supports_fractional_quantities(db):
    """Stock quantity supports NUMERIC(12,3) for fractional units (kg, L)."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.inventory import Stock

    unit = UnitOfMeasure(name="Kilogramo", abbreviation="kg", allows_fractions=True)
    db.session.add(unit)
    db.session.flush()

    product = Product(
        sku="INV-003",
        name="Cemento a granel",
        unit_id=unit.id,
        sale_price=Decimal("12.50"),
    )
    db.session.add(product)
    db.session.flush()

    stock = Stock(product_id=product.id, quantity=Decimal("250.750"))
    db.session.add(stock)
    db.session.commit()

    assert stock.quantity == Decimal("250.750")


# --- Service Tests (Task 15) ---


def _create_product_with_stock(db, sku, name, initial_qty, unit_name="Pieza", unit_abbr="pz"):
    """Helper to create a product with initial stock and a user for testing."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.user import User, Role
    from app.models.inventory import Stock

    unit = UnitOfMeasure(name=unit_name, abbreviation=unit_abbr)
    role = Role(name="admin", description="Admin")
    db.session.add_all([unit, role])
    db.session.flush()

    user = User(
        username="operador",
        email="op@test.com",
        full_name="Operador Test",
        role_id=role.id,
    )
    user.set_password("pass123")

    product = Product(
        sku=sku,
        name=name,
        unit_id=unit.id,
        sale_price=Decimal("100.00"),
        avg_cost=Decimal("60.00"),
    )
    db.session.add_all([user, product])
    db.session.flush()

    stock = Stock(product_id=product.id, quantity=Decimal(str(initial_qty)))
    db.session.add(stock)
    db.session.flush()

    return product, user, stock


def test_move_stock_entrada(db):
    """Entrada movement increases stock correctly."""
    from app.services.inventory_service import InventoryService

    product, user, stock = _create_product_with_stock(db, "SVC-001", "Clavos 2in", 100)

    result = InventoryService.move_stock(
        product_id=product.id,
        quantity=50,
        movement_type="entrada",
        reference_type="compra",
        reference_id=1,
        user_id=user.id,
        notes="Reabastecimiento",
    )

    assert result.quantity == Decimal("150.000")


def test_move_stock_salida(db):
    """Salida movement decreases stock correctly."""
    from app.services.inventory_service import InventoryService

    product, user, stock = _create_product_with_stock(db, "SVC-002", "Tornillos", 100)

    result = InventoryService.move_stock(
        product_id=product.id,
        quantity=30,
        movement_type="salida",
        reference_type="venta",
        reference_id=1,
        user_id=user.id,
    )

    assert result.quantity == Decimal("70.000")


def test_move_stock_salida_insufficient_raises(db):
    """Salida with insufficient stock raises ValueError."""
    import pytest
    from app.services.inventory_service import InventoryService

    product, user, stock = _create_product_with_stock(db, "SVC-003", "Pintura", 5)

    with pytest.raises(ValueError, match="Stock insuficiente"):
        InventoryService.move_stock(
            product_id=product.id,
            quantity=10,
            movement_type="salida",
            reference_type="venta",
            reference_id=1,
            user_id=user.id,
        )


def test_move_stock_ajuste(db):
    """Ajuste sets stock to the exact quantity given."""
    from app.services.inventory_service import InventoryService

    product, user, stock = _create_product_with_stock(db, "SVC-004", "Lija", 100)

    result = InventoryService.move_stock(
        product_id=product.id,
        quantity=42,
        movement_type="ajuste",
        reference_type="conteo",
        reference_id=1,
        user_id=user.id,
        notes="Resultado de conteo fisico",
    )

    assert result.quantity == Decimal("42.000")


def test_move_stock_creates_stock_record_if_missing(db):
    """If no Stock row exists for the product, one is created."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.user import User, Role
    from app.services.inventory_service import InventoryService

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    role = Role(name="admin", description="Admin")
    db.session.add_all([unit, role])
    db.session.flush()

    user = User(
        username="op2",
        email="op2@test.com",
        full_name="Operador 2",
        role_id=role.id,
    )
    user.set_password("pass123")
    product = Product(
        sku="SVC-005",
        name="Silicón",
        unit_id=unit.id,
        sale_price=Decimal("35.00"),
    )
    db.session.add_all([user, product])
    db.session.flush()

    # No Stock record created — InventoryService should create one
    result = InventoryService.move_stock(
        product_id=product.id,
        quantity=25,
        movement_type="entrada",
        reference_type="compra",
        reference_id=1,
        user_id=user.id,
    )

    assert result.quantity == Decimal("25.000")


def test_move_stock_records_movement_history(db):
    """Each move_stock call creates a StockMovement record."""
    from app.models.inventory import StockMovement
    from app.services.inventory_service import InventoryService

    product, user, stock = _create_product_with_stock(db, "SVC-006", "Brocha", 50)

    InventoryService.move_stock(
        product_id=product.id,
        quantity=20,
        movement_type="entrada",
        reference_type="compra",
        reference_id=10,
        user_id=user.id,
        notes="Lote #42",
    )

    movements = StockMovement.query.filter_by(product_id=product.id).all()
    assert len(movements) == 1
    m = movements[0]
    assert m.previous_stock == Decimal("50.000")
    assert m.new_stock == Decimal("70.000")
    assert m.quantity == Decimal("20.000")
    assert m.movement_type == "entrada"
    assert m.reference_type == "compra"
    assert m.reference_id == 10
    assert m.notes == "Lote #42"


def test_move_stock_fractional_quantities(db):
    """Fractional quantities work correctly for kg/L products."""
    from app.services.inventory_service import InventoryService

    product, user, stock = _create_product_with_stock(
        db, "SVC-007", "Arena", 100, unit_name="Kilogramo", unit_abbr="kg"
    )

    result = InventoryService.move_stock(
        product_id=product.id,
        quantity="2.500",
        movement_type="salida",
        reference_type="venta",
        reference_id=1,
        user_id=user.id,
    )

    assert result.quantity == Decimal("97.500")
