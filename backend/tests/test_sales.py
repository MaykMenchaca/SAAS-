"""Tests for sale models (Task 17) and sale service (Task 18)."""
from decimal import Decimal


def _seed_cash_register_session(db):
    """Helper: create user, cash register, and open session for sale tests."""
    from app.models.user import User, Role
    from app.models.sale import CashRegister, CashRegisterSession

    role = Role(name="cajero", description="Cajero")
    db.session.add(role)
    db.session.flush()

    user = User(
        username="cajero1",
        email="cajero1@test.com",
        full_name="Cajero Test",
        role_id=role.id,
    )
    user.set_password("pass123")
    db.session.add(user)
    db.session.flush()

    register = CashRegister(name="Caja 1")
    db.session.add(register)
    db.session.flush()

    session = CashRegisterSession(
        cash_register_id=register.id,
        user_id=user.id,
        opening_amount=Decimal("1000.00"),
        status="abierta",
    )
    db.session.add(session)
    db.session.flush()

    return user, register, session


def _seed_product_for_sale(db, sku="SALE-001", name="Martillo", price="149.90"):
    """Helper: create a product with stock for sale tests."""
    from app.models.product import Product, UnitOfMeasure
    from app.models.inventory import Stock

    # Reuse existing unit or create one
    unit = UnitOfMeasure.query.filter_by(name="Pieza").first()
    if not unit:
        unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
        db.session.add(unit)
        db.session.flush()

    product = Product(
        sku=sku,
        name=name,
        unit_id=unit.id,
        sale_price=Decimal(price),
        avg_cost=Decimal("60.00"),
        tax_rate=Decimal("16.00"),
    )
    db.session.add(product)
    db.session.flush()

    stock = Stock(product_id=product.id, quantity=Decimal("100.000"))
    db.session.add(stock)
    db.session.flush()

    return product


# --- Model Tests (Task 17) ---


def test_create_cash_register(db):
    from app.models.sale import CashRegister

    register = CashRegister(name="Caja Principal")
    db.session.add(register)
    db.session.commit()

    assert register.id is not None
    assert register.name == "Caja Principal"
    assert register.is_active is True


def test_create_cash_register_session(db):
    from app.models.sale import CashRegisterSession

    user, register, session = _seed_cash_register_session(db)
    db.session.commit()

    assert session.id is not None
    assert session.status == "abierta"
    assert session.opening_amount == Decimal("1000.00")
    assert session.cash_register.name == "Caja 1"
    assert session.user.username == "cajero1"


def test_create_sale_with_items_and_payment(db):
    from app.models.sale import Sale, SaleItem, Payment

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db)

    sale = Sale(
        folio="V-20260606-0001",
        session_id=session.id,
        user_id=user.id,
        subtotal=Decimal("149.90"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("23.98"),
        total=Decimal("173.88"),
    )
    db.session.add(sale)
    db.session.flush()

    item = SaleItem(
        sale_id=sale.id,
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        quantity=Decimal("1.000"),
        unit_price=Decimal("149.90"),
        tax_rate=Decimal("16.00"),
        subtotal=Decimal("149.90"),
        cost_at_sale=product.avg_cost,
    )
    db.session.add(item)

    payment = Payment(
        sale_id=sale.id,
        method="efectivo",
        amount=Decimal("200.00"),
        change_amount=Decimal("26.12"),
    )
    db.session.add(payment)
    db.session.commit()

    assert sale.id is not None
    assert sale.folio == "V-20260606-0001"
    assert sale.status == "completada"
    assert len(sale.items) == 1
    assert len(sale.payments) == 1
    assert sale.items[0].product_name == "Martillo"
    assert sale.payments[0].method == "efectivo"
    assert sale.payments[0].change_amount == Decimal("26.12")


def test_sale_item_captures_cost_at_sale(db):
    """SaleItem freezes the product cost at the moment of sale."""
    from app.models.sale import Sale, SaleItem

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db)

    sale = Sale(
        folio="V-20260606-0002",
        session_id=session.id,
        user_id=user.id,
        subtotal=Decimal("149.90"),
        tax_total=Decimal("23.98"),
        total=Decimal("173.88"),
    )
    db.session.add(sale)
    db.session.flush()

    item = SaleItem(
        sale_id=sale.id,
        product_id=product.id,
        product_name=product.name,
        product_sku=product.sku,
        quantity=Decimal("1.000"),
        unit_price=Decimal("149.90"),
        tax_rate=Decimal("16.00"),
        subtotal=Decimal("149.90"),
        cost_at_sale=Decimal("60.00"),
    )
    db.session.add(item)
    db.session.commit()

    assert item.cost_at_sale == Decimal("60.00")


def test_sale_can_be_cancelled(db):
    from app.models.sale import Sale

    user, register, session = _seed_cash_register_session(db)

    sale = Sale(
        folio="V-20260606-0003",
        session_id=session.id,
        user_id=user.id,
        subtotal=Decimal("100.00"),
        tax_total=Decimal("16.00"),
        total=Decimal("116.00"),
    )
    db.session.add(sale)
    db.session.flush()

    sale.status = "cancelada"
    sale.cancelled_by = user.id
    sale.cancel_reason = "Cliente cambio de opinion"
    db.session.commit()

    assert sale.status == "cancelada"
    assert sale.cancel_reason == "Cliente cambio de opinion"
