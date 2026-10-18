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
from app.utils.quantities import validate_quantity
from app.utils.timeutil import local_today

# Tope del Numeric(12, 2) de los totales de la orden (RF-12)
MAX_ORDER_TOTAL = Decimal("9999999999.99")


class OrderNotFoundError(ValueError):
    """La orden de compra no existe: la API responde 404, no 400 (RF-29)."""

    def __init__(self):
        super().__init__("Orden de compra no encontrada")


def _dec(value, places: str) -> str:
    return str(Decimal(value).quantize(Decimal(places)))


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
            if supplier and not supplier.is_active:
                # Se desactivó a propósito: no se usa en silencio (RF-21)
                raise ValueError(
                    "El proveedor 'Sin Proveedor' está desactivado. Elige un proveedor para la orden "
                    "o reactívalo en la pestaña Proveedores."
                )
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

        parsed_date = None
        if expected_date:
            try:
                parsed_date = datetime.strptime(expected_date, "%Y-%m-%d").date()
            except ValueError:
                raise ValueError("Formato de fecha inválido, use YYYY-MM-DD")

        # Se valida todo antes de pedir el folio: una orden rechazada ya no deja huecos en la secuencia (RF-38)
        lines = []
        subtotal = Decimal("0")
        tax_total = Decimal("0")
        for item_data in items:
            product = db.session.get(Product, item_data["product_id"])
            if not product:
                raise ValueError(f"Producto {item_data['product_id']} no encontrado")
            if not product.is_active:
                # Un producto desactivado no se vuelve a pedir (RF-38)
                raise ValueError(
                    f"El producto '{product.name}' está desactivado. Reactívalo para incluirlo en una orden."
                )

            qty = Decimal(str(item_data["quantity"]))
            # Unidades sin fracciones: solo enteros, igual que en la venta (RF-19)
            validate_quantity(qty, product.unit, product.name)
            cost = Decimal(str(item_data["unit_cost"]))
            tax_rate = Decimal(str(item_data.get("tax_rate", "16.00")))

            line_subtotal = (qty * cost).quantize(Decimal("0.01"))
            line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(
                Decimal("0.01")
            )
            lines.append((product, qty, cost, tax_rate, line_subtotal))
            subtotal += line_subtotal
            tax_total += line_tax

        if subtotal + tax_total > MAX_ORDER_TOTAL:
            raise ValueError("El total de la orden excede el máximo permitido ($9,999,999,999.99)")

        folio = PurchaseOrderService._generate_folio()
        order = PurchaseOrder(
            folio=folio,
            supplier_id=supplier_id,
            user_id=user_id,
            status="borrador",
            notes=notes,
            expected_date=parsed_date,
            subtotal=subtotal,
            tax_total=tax_total,
            total=subtotal + tax_total,
        )
        db.session.add(order)
        db.session.flush()

        for product, qty, cost, tax_rate, line_subtotal in lines:
            db.session.add(PurchaseOrderItem(
                purchase_order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                quantity=qty,
                unit_cost=cost,
                tax_rate=tax_rate,
                subtotal=line_subtotal,
            ))

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
            raise OrderNotFoundError()
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
            raise OrderNotFoundError()
        if order.status == "parcial":
            # Cancelarla dejaría en el inventario mercancía de una orden "cancelada" (RF-22)
            raise ValueError(
                "Esta orden ya tiene mercancía recibida, así que no se puede cancelar: lo recibido ya entró al "
                "inventario y no se revierte. Usa «Cerrar orden» para darla por terminada sin esperar lo pendiente."
            )
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
    def close_order(order_id: int, user_id: int, notes: str | None = None) -> PurchaseOrder:
        """Cierra una orden parcial: lo recibido se queda y lo pendiente ya no se espera (RF-22).

        No mueve inventario. La orden pasa a `cerrada` y sale de las pendientes.

        Raises:
            ValueError: Si la orden no existe o no está en estado parcial.
        """
        order = (
            db.session.query(PurchaseOrder)
            .filter_by(id=order_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not order:
            raise OrderNotFoundError()
        if order.status in ("borrador", "enviada"):
            raise ValueError(
                "Solo se cierran órdenes con recepción parcial. Si no se ha recibido nada, cancélala."
            )
        if order.status != "parcial":
            raise ValueError("Solo se cierran órdenes con recepción parcial")

        pending = [
            {"product_id": oi.product_id, "product_name": oi.product_name,
             "pending": str(oi.quantity - oi.received_quantity)}
            for oi in order.items
            if oi.received_quantity < oi.quantity
        ]
        order.status = "cerrada"

        from app.services.audit_service import log_action
        log_action(
            action="cerrar",
            entity_type="purchase_order",
            entity_id=order.id,
            user_id=user_id,
            details={"folio": order.folio, "status": "cerrada", "pending": pending, "notes": notes},
            previous_value={"status": "parcial"},
            new_value={"status": "cerrada"},
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
            raise OrderNotFoundError()
        if order.status not in ("enviada", "parcial"):
            raise ValueError(
                "Solo se pueden recibir órdenes enviadas o parcialmente recibidas"
            )

        # Bloqueo del stock en orden de producto antes de recibir (OPS-09)
        InventoryService.lock_stock(oi.product_id for oi in order.items)
        received = []  # detalle para la auditoría (RF-39)
        for item_data in items:
            order_item = db.session.get(
                PurchaseOrderItem, item_data["order_item_id"], populate_existing=True
            )
            if not order_item or order_item.purchase_order_id != order_id:
                raise ValueError(
                    f"Item {item_data['order_item_id']} no pertenece a esta orden"
                )

            recv_qty = Decimal(str(item_data["received_quantity"]))
            validate_quantity(recv_qty, order_item.product.unit, order_item.product_name)  # RF-19
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
            previous_avg = product.avg_cost if product else None
            if product and stock:
                current_stock = stock.quantity  # already updated by move_stock
                old_stock = current_stock - recv_qty
                prior_avg = product.avg_cost or Decimal("0")
                if old_stock <= 0 or prior_avg <= 0:
                    # Sin existencias previas, o con unidades de costo desconocido (alta sin precio de compra,
                    # carga por ajuste): esas unidades no deben diluir el costo a 0 (RF-07)
                    product.avg_cost = Decimal(order_item.unit_cost).quantize(Decimal("0.0001"))
                elif current_stock > 0:
                    new_avg = (
                        (old_stock * prior_avg + recv_qty * order_item.unit_cost)
                        / current_stock
                    ).quantize(Decimal("0.0001"))
                    product.avg_cost = new_avg

            if product and stock:
                received.append({
                    "product_id": order_item.product_id,
                    "product_name": order_item.product_name,
                    "received_quantity": str(recv_qty),
                    "previous_stock": _dec(stock.quantity - recv_qty, "0.001"),
                    "new_stock": _dec(stock.quantity, "0.001"),
                    "previous_avg_cost": _dec(previous_avg or 0, "0.0001"),
                    "new_avg_cost": _dec(product.avg_cost or 0, "0.0001"),
                })

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
                # Stock y costo promedio antes y después por partida; el cambio de avg_cost no se auditaba (RF-39)
                "items": received,
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
