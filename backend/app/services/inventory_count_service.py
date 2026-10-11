"""Inventory count service — physical inventory count with auto-adjustment."""
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db
from app.models.inventory import InventoryCount, InventoryCountItem, Stock
from app.models.product import Product
from app.services.inventory_service import InventoryService
from app.utils.decorators import with_rollback


class InventoryCountService:
    """Handles physical inventory count lifecycle: create → capture → close."""

    @staticmethod
    @with_rollback
    def create_count(user_id: int, notes: str | None = None) -> InventoryCount:
        """Create a new inventory count, pre-populated with all active products.

        Each active product with a stock record becomes a count item with
        expected_quantity set to the current stock level.

        Args:
            user_id: User creating the count.
            notes: Optional description of the count.

        Returns:
            The created InventoryCount with items.

        Raises:
            ValueError: If there is already a count in progress.
        """
        # Prevent concurrent counts
        active = InventoryCount.query.filter(
            InventoryCount.status.in_(["pendiente", "en_proceso"])
        ).first()
        if active:
            raise ValueError(
                "Ya existe un conteo en proceso. Ciérrelo o cancélelo antes de crear uno nuevo."
            )

        count = InventoryCount(
            user_id=user_id,
            status="pendiente",
            notes=notes,
        )
        db.session.add(count)
        db.session.flush()

        # Pre-populate with all active products that have stock records
        stocks = (
            Stock.query
            .join(Product)
            .filter(Product.is_active.is_(True))
            .all()
        )

        for stock in stocks:
            item = InventoryCountItem(
                inventory_count_id=count.id,
                product_id=stock.product_id,
                expected_quantity=stock.quantity,
            )
            db.session.add(item)

        from app.services.audit_service import log_action
        log_action(
            action="count_create",
            entity_type="inventory_count",
            entity_id=count.id,
            details={"notes": notes, "total_items": len(stocks)},
            user_id=user_id,
        )

        db.session.commit()
        return count

    @staticmethod
    @with_rollback
    def capture_item(
        count_id: int,
        product_id: int,
        counted_quantity: Decimal,
        notes: str | None = None,
    ) -> InventoryCountItem:
        """Record the physical count for a single item.

        Args:
            count_id: The inventory count session.
            product_id: Product being counted.
            counted_quantity: Actual physical quantity found.
            notes: Optional notes about this item.

        Returns:
            The updated InventoryCountItem.

        Raises:
            ValueError: If count is not active or item not found.
        """
        count = db.session.get(InventoryCount, count_id)
        if not count:
            raise ValueError("Conteo no encontrado")
        if count.status not in ("pendiente", "en_proceso"):
            raise ValueError("El conteo ya está cerrado o cancelado")

        item = InventoryCountItem.query.filter_by(
            inventory_count_id=count_id,
            product_id=product_id,
        ).first()
        if not item:
            raise ValueError(
                f"Producto {product_id} no encontrado en este conteo"
            )

        counted = Decimal(str(counted_quantity))
        item.counted_quantity = counted
        item.difference = counted - item.expected_quantity
        item.notes = notes

        # Move status to en_proceso on first capture
        if count.status == "pendiente":
            count.status = "en_proceso"

        db.session.commit()
        return item

    @staticmethod
    @with_rollback
    def close_count(count_id: int, user_id: int) -> InventoryCount:
        """Close the count and auto-adjust stock for items with differences.

        Only items that have been counted (counted_quantity is not None) will
        generate stock adjustments. Uncounted items are left as-is.

        Args:
            count_id: The inventory count to close.
            user_id: User closing the count.

        Returns:
            The closed InventoryCount.

        Raises:
            ValueError: If count not found or not active.
        """
        count = db.session.get(InventoryCount, count_id)
        if not count:
            raise ValueError("Conteo no encontrado")
        if count.status not in ("pendiente", "en_proceso"):
            raise ValueError("El conteo ya está cerrado o cancelado")

        # Apply stock adjustments for counted items with differences
        # (bloqueo del stock en orden de producto antes de ajustar, OPS-09)
        InventoryService.lock_stock(
            item.product_id for item in count.items
            if item.counted_quantity is not None and item.difference != Decimal("0")
        )
        for item in count.items:
            if item.counted_quantity is None:
                continue  # skip uncounted items

            if item.difference != Decimal("0"):
                InventoryService.move_stock(
                    product_id=item.product_id,
                    quantity=item.difference,
                    movement_type="ajuste",
                    reference_type="conteo",
                    reference_id=count.id,
                    user_id=user_id,
                    notes=f"Ajuste por conteo físico: diferencia {item.difference} (esperado: {item.expected_quantity}, contado: {item.counted_quantity})",
                    is_delta=True,
                )

        count.status = "cerrado"
        count.closed_at = datetime.now(timezone.utc)
        count.closed_by = user_id

        from app.services.audit_service import log_action
        log_action(
            action="count_close",
            entity_type="inventory_count",
            entity_id=count.id,
            details={"status": "cerrado", "notes": count.notes},
            user_id=user_id,
        )

        db.session.commit()
        return count

    @staticmethod
    @with_rollback
    def cancel_count(count_id: int, user_id: int) -> InventoryCount:
        """Cancel a count without applying any adjustments.

        Args:
            count_id: The inventory count to cancel.
            user_id: User cancelling the count.

        Returns:
            The cancelled InventoryCount.

        Raises:
            ValueError: If count not found or already closed/cancelled.
        """
        count = db.session.get(InventoryCount, count_id)
        if not count:
            raise ValueError("Conteo no encontrado")
        if count.status not in ("pendiente", "en_proceso"):
            raise ValueError("El conteo ya está cerrado o cancelado")

        count.status = "cancelado"
        count.closed_at = datetime.now(timezone.utc)
        count.closed_by = user_id

        from app.services.audit_service import log_action
        log_action(
            action="count_cancel",
            entity_type="inventory_count",
            entity_id=count.id,
            details={"status": "cancelado", "notes": count.notes},
            user_id=user_id,
        )

        db.session.commit()
        return count

    @staticmethod
    def get_count(count_id: int) -> InventoryCount | None:
        """Get an inventory count by ID."""
        return db.session.get(InventoryCount, count_id)
