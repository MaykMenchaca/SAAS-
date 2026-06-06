"""Sale service — complete transactional sale logic."""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import text

from app.extensions import db
from app.models.product import Product
from app.models.sale import CashRegisterSession, Payment, Sale, SaleItem
from app.services.inventory_service import InventoryService


class SaleService:
    """Handles sale creation with inventory deduction and payment validation."""

    @staticmethod
    def create_sale(user_id: int, session_id: int, items: list, payments: list) -> Sale:
        """Create a complete sale atomically.

        1. Validates cash register session is open
        2. Generates folio from PostgreSQL sequence
        3. Creates sale items with discount calculation
        4. Deducts inventory for each item (with row-level locking)
        5. Validates payment covers the total

        Args:
            user_id: Cashier performing the sale.
            session_id: Open CashRegisterSession id.
            items: List of dicts with product_id, quantity, unit_price, tax_rate,
                   and optional discount_percent.
            payments: List of dicts with method, amount, and optional reference/change_amount.

        Returns:
            The created Sale object.

        Raises:
            ValueError: If session is closed, stock insufficient, or payment insufficient.
        """
        session = db.session.get(CashRegisterSession, session_id)
        if not session or session.status != "abierta":
            raise ValueError("La sesión de caja no está abierta")

        folio = SaleService._generate_folio()

        sale = Sale(
            folio=folio,
            session_id=session_id,
            user_id=user_id,
            subtotal=Decimal("0"),
            discount_total=Decimal("0"),
            tax_total=Decimal("0"),
            total=Decimal("0"),
        )
        db.session.add(sale)
        db.session.flush()

        subtotal = Decimal("0")
        discount_total = Decimal("0")
        tax_total = Decimal("0")

        for item_data in items:
            qty = Decimal(str(item_data["quantity"]))
            price = Decimal(str(item_data["unit_price"]))
            disc_pct = Decimal(str(item_data.get("discount_percent", 0)))
            tax_rate = Decimal(str(item_data["tax_rate"]))

            product = db.session.get(Product, item_data["product_id"])
            if not product:
                raise ValueError(f"Producto {item_data['product_id']} no encontrado")

            line_gross = qty * price
            line_discount = (line_gross * disc_pct / Decimal("100")).quantize(
                Decimal("0.01")
            )
            line_subtotal = line_gross - line_discount
            line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(
                Decimal("0.01")
            )

            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                quantity=qty,
                unit_price=price,
                discount_percent=disc_pct,
                discount_amount=line_discount,
                tax_rate=tax_rate,
                subtotal=line_subtotal,
                cost_at_sale=product.avg_cost,
            )
            db.session.add(sale_item)

            # Deduct inventory (atomic with SELECT FOR UPDATE)
            InventoryService.move_stock(
                product_id=product.id,
                quantity=qty,
                movement_type="salida",
                reference_type="venta",
                reference_id=sale.id,
                user_id=user_id,
            )

            subtotal += line_subtotal
            discount_total += line_discount
            tax_total += line_tax

        sale.subtotal = subtotal
        sale.discount_total = discount_total
        sale.tax_total = tax_total
        sale.total = subtotal + tax_total

        # Process payments
        payment_total = Decimal("0")
        for pay_data in payments:
            amount = Decimal(str(pay_data["amount"]))
            payment = Payment(
                sale_id=sale.id,
                method=pay_data["method"],
                amount=amount,
                reference=pay_data.get("reference"),
                change_amount=Decimal(str(pay_data.get("change_amount", 0))),
            )
            db.session.add(payment)
            payment_total += amount

        if payment_total < sale.total:
            raise ValueError(
                f"Pago insuficiente: total ${sale.total}, recibido ${payment_total}"
            )

        db.session.commit()
        return sale

    @staticmethod
    def cancel_sale(sale_id: int, user_id: int, reason: str) -> Sale:
        """Cancel a sale and return inventory.

        Args:
            sale_id: Sale to cancel.
            user_id: User performing the cancellation.
            reason: Reason for cancellation.

        Returns:
            The cancelled Sale object.

        Raises:
            ValueError: If sale is already cancelled.
        """
        sale = db.session.get(Sale, sale_id)
        if not sale:
            raise ValueError("Venta no encontrada")
        if sale.status == "cancelada":
            raise ValueError("La venta ya está cancelada")

        # Return inventory for each item
        for item in sale.items:
            InventoryService.move_stock(
                product_id=item.product_id,
                quantity=item.quantity,
                movement_type="entrada",
                reference_type="cancelacion",
                reference_id=sale.id,
                user_id=user_id,
            )

        sale.status = "cancelada"
        sale.cancelled_by = user_id
        sale.cancel_reason = reason
        db.session.commit()
        return sale

    @staticmethod
    def get_sale(sale_id: int) -> Sale | None:
        """Get a sale by ID."""
        return db.session.get(Sale, sale_id)

    @staticmethod
    def _generate_folio() -> str:
        """Generate a unique sale folio using a PostgreSQL sequence.

        Format: V-YYYYMMDD-NNNN (e.g., V-20260606-0042)
        Thread-safe via database sequence.
        """
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y%m%d")
        result = db.session.execute(text("SELECT nextval('sale_folio_seq')"))
        seq = result.scalar()
        return f"V-{date_str}-{seq:04d}"
