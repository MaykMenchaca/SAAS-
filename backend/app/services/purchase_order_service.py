"""Purchase order service — create, send, receive, cancel."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import text

from app.extensions import db
from app.models.inventory import Stock
from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseOrderItem, Supplier
from app.services.inventory_service import InventoryService
from app.utils.decorators import with_rollback
from app.utils.timeutil import local_today


class PurchaseOrderService:
    """Handles purchase order lifecycle: draft → sent → (partial →) received."""

    @staticmethod
    @with_rollback
    def create_order(
        user_id: int,
        supplier_id: int | None,
        items: list,
        notes: str | None = None,
        expected_date: str | None = None,
    ) -> PurchaseOrder:
        """Create a new purchase order in draft status.

        Args:
            user_id: User creating the order.
            supplier_id: Supplier for this order (optional).
            items: List of dicts with product_id, quantity, unit_cost, tax_rate.
            notes: Optional notes.
            expected_date: Optional expected delivery date (YYYY-MM-DD).

        Returns:
            The created PurchaseOrder.

        Raises:
            ValueError: If supplier not found or items invalid.
        """
        if not supplier_id:
            supplier = Supplier.query.filter_by(name="Sin Proveedor").first()
            if not supplier:
                supplier = Supplier(
                    name="Sin Proveedor",
                    rfc=None,
                    contact_name="Por defecto",
                    phone=None,
                    email=None,
                    address=None,
                    payment_terms=None,
                    notes="Proveedor por defecto para compras sin proveedor asignado.",
                    is_active=True
                )
                db.session.add(supplier)
                db.session.flush()
            supplier_id = supplier.id
        else:
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

        from app.services.audit_service import log_action
        log_action(
            action="crear",
            entity_type="purchase_order",
            entity_id=order.id,
            user_id=user_id,
            details={
                "folio": order.folio,
                "supplier_id": supplier_id,
                "total": str(order.total),
                "items_count": len(items),
            },
            new_value={
                "folio": order.folio,
                "supplier_id": supplier_id,
                "status": order.status,
                "total": str(order.total),
            },
        )

        db.session.commit()
        return order

    @staticmethod
    @with_rollback
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

        prev_status = order.status
        order.status = "enviada"

        from app.services.audit_service import log_action
        log_action(
            action="enviar",
            entity_type="purchase_order",
            entity_id=order.id,
            details={"folio": order.folio, "status": "enviada"},
            previous_value={"status": prev_status},
            new_value={"status": "enviada"},
        )

        db.session.commit()
        return order

    @staticmethod
    @with_rollback
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

        prev_status = order.status
        order.status = "cancelada"

        from app.services.audit_service import log_action
        log_action(
            action="cancelar",
            entity_type="purchase_order",
            entity_id=order.id,
            details={"folio": order.folio, "status": "cancelada"},
            previous_value={"status": prev_status},
            new_value={"status": "cancelada"},
        )

        db.session.commit()
        return order

    @staticmethod
    @with_rollback
    def receive_order(order_id: int, user_id: int, items: list) -> PurchaseOrder:
        """Receive items for a purchase order.

        For each received item:
        1. Validates quantity doesn't exceed remaining
        2. Updates received_quantity on the order item
        3. Adds inventory via InventoryService (entrada, compra)
        4. Updates product avg_cost using weighted average

        Args:
            order_id: Order to receive against.
            user_id: User performing the reception.
            items: List of dicts with order_item_id and received_quantity.

        Returns:
            The updated PurchaseOrder.

        Raises:
            ValueError: If order not receivable or quantities invalid.
        """
        # Bloqueo de la orden: dos recepciones simultáneas no pueden superar lo pendiente (H-31)
        order = (
            db.session.query(PurchaseOrder)
            .filter_by(id=order_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not order:
            raise ValueError("Orden de compra no encontrada")
        if order.status not in ("enviada", "parcial"):
            raise ValueError(
                "Solo se pueden recibir órdenes enviadas o parcialmente recibidas"
            )

        for item_data in items:
            order_item = db.session.get(
                PurchaseOrderItem, item_data["order_item_id"], populate_existing=True
            )
            if not order_item or order_item.purchase_order_id != order_id:
                raise ValueError(
                    f"Item {item_data['order_item_id']} no pertenece a esta orden"
                )

            recv_qty = Decimal(str(item_data["received_quantity"]))
            remaining = order_item.quantity - order_item.received_quantity

            if recv_qty > remaining:
                raise ValueError(
                    f"Cantidad recibida ({recv_qty}) excede lo pendiente ({remaining}) "
                    f"para {order_item.product_name}"
                )

            # Update received quantity
            order_item.received_quantity += recv_qty

            # Add inventory
            InventoryService.move_stock(
                product_id=order_item.product_id,
                quantity=recv_qty,
                movement_type="entrada",
                reference_type="compra",
                reference_id=order.id,
                user_id=user_id,
                notes=f"Recepción OC {order.folio}",
            )

            # Update weighted average cost
            product = db.session.get(Product, order_item.product_id)
            stock = Stock.query.filter_by(product_id=order_item.product_id).first()
            if product and stock:
                current_stock = stock.quantity  # already updated by move_stock
                old_stock = current_stock - recv_qty
                if current_stock > 0:
                    new_avg = (
                        (old_stock * product.avg_cost + recv_qty * order_item.unit_cost)
                        / current_stock
                    ).quantize(Decimal("0.0001"))
                    product.avg_cost = new_avg

        # Determine new status
        all_received = all(
            oi.received_quantity >= oi.quantity for oi in order.items
        )
        prev_status = order.status
        order.status = "recibida" if all_received else "parcial"

        from app.services.audit_service import log_action
        log_action(
            action="recibir",
            entity_type="purchase_order",
            entity_id=order.id,
            user_id=user_id,
            details={
                "folio": order.folio,
                "status": order.status,
                "received_items": len(items),
            },
            previous_value={"status": prev_status},
            new_value={"status": order.status},
        )

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
        date_str = local_today().strftime("%Y%m%d")
        result = db.session.execute(text("SELECT nextval('purchase_order_folio_seq')"))
        seq = result.scalar()
        return f"OC-{date_str}-{seq:04d}"
