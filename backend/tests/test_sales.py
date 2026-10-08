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


# --- Service Tests (Task 18) ---


def test_service_create_sale_success(db):
    """SaleService creates sale, deducts inventory, records payment."""
    from app.services.sale_service import SaleService
    from app.models.inventory import Stock

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "SRV-001", "Taladro", "500.00")

    sale = SaleService.create_sale(
        user_id=user.id,
        session_id=session.id,
        items=[
            {
                "product_id": product.id,
                "quantity": 2,
                "unit_price": "500.00",
                "tax_rate": "16.00",
            }
        ],
        payments=[
            {"method": "efectivo", "amount": "1160.00"},
        ],
    )

    assert sale.id is not None
    assert sale.folio.startswith("V-")
    assert sale.subtotal == Decimal("1000.00")
    assert sale.tax_total == Decimal("160.00")
    assert sale.total == Decimal("1160.00")
    assert len(sale.items) == 1
    assert sale.items[0].product_name == "Taladro"
    assert sale.items[0].cost_at_sale == Decimal("60.00")
    assert len(sale.payments) == 1

    # Verify inventory was deducted
    stock = Stock.query.filter_by(product_id=product.id).first()
    assert stock.quantity == Decimal("98.000")


def test_service_create_sale_with_discount(db):
    """SaleService correctly applies per-item percentage discounts."""
    from app.services.sale_service import SaleService
    from app.models.user import Permission

    user, register, session = _seed_cash_register_session(db)
    perm = Permission(code="ventas:descuento", module="ventas", description="Descuento")
    db.session.add(perm)
    user.role_rel.permissions.append(perm)
    db.session.flush()

    product = _seed_product_for_sale(db, "SRV-002", "Sierra", "200.00")

    sale = SaleService.create_sale(
        user_id=user.id,
        session_id=session.id,
        items=[
            {
                "product_id": product.id,
                "quantity": 1,
                "unit_price": "200.00",
                "tax_rate": "16.00",
                "discount_percent": "10",
            }
        ],
        payments=[
            {"method": "tarjeta", "amount": "208.80"},
        ],
    )

    item = sale.items[0]
    assert item.discount_percent == Decimal("10.00")
    assert item.discount_amount == Decimal("20.00")
    assert item.subtotal == Decimal("180.00")
    assert sale.discount_total == Decimal("20.00")
    assert sale.tax_total == Decimal("28.80")
    assert sale.total == Decimal("208.80")


def test_service_create_sale_insufficient_stock(db):
    """SaleService raises error when trying to sell more than available stock."""
    import pytest
    from app.services.sale_service import SaleService

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "SRV-003", "Pintura", "300.00")

    with pytest.raises(ValueError, match="Stock insuficiente"):
        SaleService.create_sale(
            user_id=user.id,
            session_id=session.id,
            items=[
                {
                    "product_id": product.id,
                    "quantity": 999,
                    "unit_price": "300.00",
                    "tax_rate": "16.00",
                }
            ],
            payments=[
                {"method": "efectivo", "amount": "999999.00"},
            ],
        )


def test_service_create_sale_insufficient_payment(db):
    """SaleService raises error when payment is less than total."""
    import pytest
    from app.services.sale_service import SaleService

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "SRV-004", "Llave", "50.00")

    with pytest.raises(ValueError, match="Pago insuficiente"):
        SaleService.create_sale(
            user_id=user.id,
            session_id=session.id,
            items=[
                {
                    "product_id": product.id,
                    "quantity": 1,
                    "unit_price": "50.00",
                    "tax_rate": "16.00",
                }
            ],
            payments=[
                {"method": "efectivo", "amount": "10.00"},
            ],
        )


def test_service_create_sale_closed_session_rejected(db):
    """SaleService rejects sales on a closed cash register session."""
    import pytest
    from app.services.sale_service import SaleService

    user, register, session = _seed_cash_register_session(db)
    session.status = "cerrada"
    db.session.flush()

    product = _seed_product_for_sale(db, "SRV-005", "Cinta", "25.00")

    with pytest.raises(ValueError, match="no está abierta"):
        SaleService.create_sale(
            user_id=user.id,
            session_id=session.id,
            items=[
                {
                    "product_id": product.id,
                    "quantity": 1,
                    "unit_price": "25.00",
                    "tax_rate": "16.00",
                }
            ],
            payments=[
                {"method": "efectivo", "amount": "29.00"},
            ],
        )


def test_service_cancel_sale_returns_inventory(db):
    """Cancelling a sale returns items to inventory."""
    from app.services.sale_service import SaleService
    from app.models.inventory import Stock

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "SRV-006", "Clavos", "10.00")

    sale = SaleService.create_sale(
        user_id=user.id,
        session_id=session.id,
        items=[
            {
                "product_id": product.id,
                "quantity": 20,
                "unit_price": "10.00",
                "tax_rate": "16.00",
            }
        ],
        payments=[
            {"method": "efectivo", "amount": "232.00"},
        ],
    )

    # Stock should be 80 after sale
    stock = Stock.query.filter_by(product_id=product.id).first()
    assert stock.quantity == Decimal("80.000")

    # Cancel the sale
    cancelled = SaleService.cancel_sale(
        sale_id=sale.id,
        user_id=user.id,
        reason="Error de captura",
    )

    assert cancelled.status == "cancelada"
    assert cancelled.cancel_reason == "Error de captura"

    # Stock should be back to 100
    db.session.refresh(stock)
    assert stock.quantity == Decimal("100.000")


def test_service_cancel_already_cancelled_sale(db):
    """Cannot cancel an already cancelled sale."""
    import pytest
    from app.services.sale_service import SaleService

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "SRV-007", "Broca", "15.00")

    sale = SaleService.create_sale(
        user_id=user.id,
        session_id=session.id,
        items=[
            {
                "product_id": product.id,
                "quantity": 1,
                "unit_price": "15.00",
                "tax_rate": "16.00",
            }
        ],
        payments=[
            {"method": "efectivo", "amount": "17.40"},
        ],
    )

    SaleService.cancel_sale(sale.id, user.id, "Primera cancelacion")

    with pytest.raises(ValueError, match="ya está cancelada"):
        SaleService.cancel_sale(sale.id, user.id, "Segunda cancelacion")


# --- Regression Tests: Subfase 1.1 (H-01) ---


def test_precio_del_cliente_se_ignora(db):
    """El cliente manda unit_price=0.01 y tax_rate=0 pero el servidor usa el catálogo."""
    from app.services.sale_service import SaleService

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "H01-001", "Tuerca", "34.90")

    # Catalog: price=34.90, tax_rate=16.00 -> 34.90 + 5.58 = 40.48
    sale = SaleService.create_sale(
        user_id=user.id,
        session_id=session.id,
        items=[
            {
                "product_id": product.id,
                "quantity": 1,
                "unit_price": "0.01",  # Client tries to force $0.01
                "tax_rate": "0.00",    # Client tries to force 0% tax
            }
        ],
        payments=[
            {"method": "efectivo", "amount": "40.48"},
        ],
    )

    assert sale.items[0].unit_price == Decimal("34.90")
    assert sale.items[0].tax_rate == Decimal("16.00")
    assert sale.subtotal == Decimal("34.90")
    assert sale.tax_total == Decimal("5.58")
    assert sale.total == Decimal("40.48")


def test_descuento_sobre_tope_rechazado(db):
    """Cajero sin permiso ventas:descuento no puede superar max_discount_percent."""
    import pytest
    from app.services.sale_service import SaleService
    from app.models.user import Permission

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "H01-002", "Pala", "250.00")

    # Default max_discount_percent is 0; 10% discount must be rejected for cashier without permission
    with pytest.raises(ValueError, match="descuento"):
        SaleService.create_sale(
            user_id=user.id,
            session_id=session.id,
            items=[
                {
                    "product_id": product.id,
                    "quantity": 1,
                    "discount_percent": "10",
                }
            ],
            payments=[{"method": "efectivo", "amount": "261.00"}],
        )

    # If user is granted 'ventas:descuento', discount is allowed
    perm = Permission(code="ventas:descuento", module="ventas", description="Permiso de descuento")
    db.session.add(perm)
    user.role_rel.permissions.append(perm)
    db.session.commit()

    sale = SaleService.create_sale(
        user_id=user.id,
        session_id=session.id,
        items=[
            {
                "product_id": product.id,
                "quantity": 1,
                "discount_percent": "10",
            }
        ],
        payments=[{"method": "efectivo", "amount": "261.00"}],
    )
    assert sale.items[0].discount_percent == Decimal("10.00")


def test_producto_inactivo_rechazado(db):
    """No se pueden vender productos inactivos."""
    import pytest
    from app.services.sale_service import SaleService

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "H01-003", "Tornillo Viejo", "5.00")
    product.is_active = False
    db.session.commit()

    with pytest.raises(ValueError, match="inactivo"):
        SaleService.create_sale(
            user_id=user.id,
            session_id=session.id,
            items=[
                {
                    "product_id": product.id,
                    "quantity": 1,
                }
            ],
            payments=[{"method": "efectivo", "amount": "5.80"}],
        )


def test_fraccion_en_unidad_entera_rechazada(db):
    """No se pueden vender fracciones de productos con allows_fractions = False."""
    import pytest
    from app.services.sale_service import SaleService

    user, register, session = _seed_cash_register_session(db)
    product = _seed_product_for_sale(db, "H01-004", "Martillo Entero", "150.00")
    # Unit 'Pieza' has allows_fractions = False
    assert product.unit.allows_fractions is False

    with pytest.raises(ValueError, match="fraccion"):
        SaleService.create_sale(
            user_id=user.id,
            session_id=session.id,
            items=[
                {
                    "product_id": product.id,
                    "quantity": "1.5",
                }
            ],
            payments=[{"method": "efectivo", "amount": "261.00"}],
        )


# --- Regression Tests: Subfase 1.2.1 (H-04) ---


def test_quote_igual_a_venta(db, client, admin_token, seed_open_session, seed_product_for_sale):
    """POST /api/sales/quote calcula exactamente las mismas líneas y totales que la venta."""
    items = [
        {"product_id": seed_product_for_sale.id, "quantity": 2, "discount_percent": "5"},
    ]

    quote_resp = client.post(
        "/api/sales/quote",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"items": items},
    )
    assert quote_resp.status_code == 200
    quote_data = quote_resp.get_json()

    # Create the real sale with same items
    # 2 * 100 = 200, 5% disc = 10, subtotal = 190, 16% tax = 30.40, total = 220.40
    sale_resp = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "items": items,
            "payments": [{"method": "efectivo", "amount": quote_data["total"]}],
        },
    )
    assert sale_resp.status_code == 201
    sale_data = sale_resp.get_json()

    assert quote_data["subtotal"] == sale_data["subtotal"]
    assert quote_data["discount_total"] == sale_data["discount_total"]
    assert quote_data["tax_total"] == sale_data["tax_total"]
    assert quote_data["total"] == sale_data["total"]
    assert len(quote_data["lines"]) == len(sale_data["items"])
    assert quote_data["lines"][0]["unit_price"] == sale_data["items"][0]["unit_price"]
    assert quote_data["lines"][0]["discount_amount"] == sale_data["items"][0]["discount_amount"]
    assert quote_data["lines"][0]["tax_rate"] == sale_data["items"][0]["tax_rate"]
    assert quote_data["lines"][0]["subtotal"] == sale_data["items"][0]["subtotal"]


def test_redondeo_half_even_por_linea(db, client, admin_token):
    """2 items a $12.85 con 16% IVA dan exactamente $29.82 por redondeo HALF_EVEN por línea."""
    from app.services.sale_service import SaleService

    p1 = _seed_product_for_sale(db, sku="RND-001", name="Clavo A", price="12.85")
    p2 = _seed_product_for_sale(db, sku="RND-002", name="Clavo B", price="12.85")

    items = [
        {"product_id": p1.id, "quantity": 1},
        {"product_id": p2.id, "quantity": 1},
    ]

    pricing = SaleService.price_lines(items)
    # Line 1: 12.85 * 0.16 = 2.056 -> round half even -> 2.06. Total line = 14.91
    # Line 2: 12.85 * 0.16 = 2.056 -> round half even -> 2.06. Total line = 14.91
    # Subtotal: 25.70, Tax: 4.12, Total: 29.82
    # (Global tax would have been 25.70 * 0.16 = 4.112 -> 4.11, Total 29.81)
    assert pricing["subtotal"] == Decimal("25.70")
    assert pricing["tax_total"] == Decimal("4.12")
    assert pricing["total"] == Decimal("29.82")

    # Verify through quote endpoint as well
    resp = client.post(
        "/api/sales/quote",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"items": items},
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total"] == "29.82"
    assert data["tax_total"] == "4.12"
