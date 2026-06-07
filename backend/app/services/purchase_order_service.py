"""Purchase order service — create, send, receive, cancel."""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import text

from app.extensions import db
from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseOrderItem, Supplier


class PurchaseOrderService:
    """Handles purchase order lifecycle: draft → sent → (partial →) received."""

    @staticmethod
    def create_order(
        user_id: int,
        supplier_id: int,
        items: list,
        notes: str | None = None,
        expected_date: str | None = None,
    ) -> PurchaseOrder:
        """Create a new purchase order in draft status.

        Args:
            user_id: User creating the order.
            supplier_id: Supplier for this order.
            items: List of dicts with product_id, quantity, unit_cost, tax_rate.
            notes: Optional notes.
            expected_date: Optional expected delivery date (YYYY-MM-DD).

        Returns:
            The created PurchaseOrder.

        Raises:
            ValueError: If supplier not found or items invalid.
        """
        supplier = db.session.get(Supplier, supplier_id)
        if not supplier or not supplier.is_active:
            raise ValueError("Proveedor no encontrado o inactivo")

        folio = PurchaseOrderService._generate_folio()

        parsed_date = None
        if expected_date:
            try:
                parsed_date = datetime.strptime(expected_date, "%Y-%m-%d").date()
            except ValueError:
                raise ValueError("Formato de fecha inválido, use YYYY-MM-DD")

        order = PurchaseOrder(
            folio=folio,
            supplier_id=supplier_id,
            user_id=user_id,
            status="borrador",
            notes=notes,
            expected_date=parsed_date,
            subtotal=Decimal("0"),
            tax_total=Decimal("0"),
            total=Decimal("0"),
        )
        db.session.add(order)
        db.session.flush()

        subtotal = Decimal("0")
        tax_total = Decimal("0")

        for item_data in items:
            product = db.session.get(Product, item_data["product_id"])
            if not product:
                raise ValueError(f"Producto {item_data['product_id']} no encontrado")

            qty = Decimal(str(item_data["quantity"]))
            cost = Decimal(str(item_data["unit_cost"]))
            tax_rate = Decimal(str(item_data.get("tax_rate", "16.00")))

            line_subtotal = (qty * cost).quantize(Decimal("0.01"))
            line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(
                Decimal("0.01")
            )

            order_item = PurchaseOrderItem(
                purchase_order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                quantity=qty,
                unit_cost=cost,
                tax_rate=tax_rate,
                subtotal=line_subtotal,
            )
            db.session.add(order_item)

            subtotal += line_subtotal
            tax_total += line_tax

        order.subtotal = subtotal
        order.tax_total = tax_total
        order.total = subtotal + tax_total

        db.session.commit()
        return order

    @staticmethod
    def send_order(order_id: int) -> PurchaseOrder:
        """Mark a draft order as sent to the supplier.

        Args:
            order_id: Order to send.

        Returns:
            The updated PurchaseOrder.

        Raises:
            ValueError: If not in draft status.
        """
        order = db.session.get(PurchaseOrder, order_id)
        if not order:
            raise ValueError("Orden de compra no encontrada")
        if order.status != "borrador":
            raise ValueError("Solo se pueden enviar órdenes en borrador")

        order.status = "enviada"
        db.session.commit()
        return order

    @staticmethod
    def cancel_order(order_id: int) -> PurchaseOrder:
        """Cancel a purchase order.

        Only draft or sent orders can be cancelled.
        Orders that have been partially or fully received cannot be cancelled.

        Args:
            order_id: Order to cancel.

        Returns:
            The cancelled PurchaseOrder.

        Raises:
            ValueError: If order cannot be cancelled.
        """
        order = db.session.get(PurchaseOrder, order_id)
        if not order:
            raise ValueError("Orden de compra no encontrada")
        if order.status not in ("borrador", "enviada"):
            raise ValueError(
                "Solo se pueden cancelar órdenes en borrador o enviadas"
            )

        order.status = "cancelada"
        db.session.commit()
        return order

    @staticmethod
    def get_order(order_id: int) -> PurchaseOrder | None:
        """Get a purchase order by ID."""
        return db.session.get(PurchaseOrder, order_id)

    @staticmethod
    def _generate_folio() -> str:
        """Generate a unique purchase order folio using a PostgreSQL sequence.

        Format: OC-YYYYMMDD-NNNN (e.g., OC-20260607-0001)
        """
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y%m%d")
        result = db.session.execute(text("SELECT nextval('purchase_order_folio_seq')"))
        seq = result.scalar()
        return f"OC-{date_str}-{seq:04d}"
