"""Inventory count service — physical inventory count with auto-adjustment."""
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db
from app.models.inventory import InventoryCount, InventoryCountItem, Stock
from app.models.product import Product
from app.services.inventory_service import InventoryService
from app.utils.decorators import with_rollback
from app.utils.quantities import validate_quantity

# Valor por omisión de `notes` al capturar: si el cliente no manda notas, se conserva la anterior (RF-36)
KEEP_NOTES = object()


class CountNotFoundError(ValueError):
    """El conteo no existe: la API responde 404, no 400 (RF-29)."""

    def __init__(self):
        super().__init__("Conteo no encontrado")


class CountNegativeStockError(ValueError):
    """Cerrar el conteo dejaría un producto con stock negativo (RF-32)."""

    def __init__(self, message: str, product_id: int):
        super().__init__(message)
        self.product_id = product_id


def _fmt(qty: Decimal) -> str:
    return f"{Decimal(qty).normalize():f}"


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

        # Productos activos y también los inactivos con existencias: salen en /inventory/stock y sin esto
        # nunca se podían conciliar por conteo (H-43, QA-B-21)
        stocks = (
            Stock.query
            .join(Product)
            .filter(db.or_(Product.is_active.is_(True), Stock.quantity != 0))
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
        notes=KEEP_NOTES,
    ) -> InventoryCountItem:
        """Record the physical count for a single item.

        Args:
            count_id: The inventory count session.
            product_id: Product being counted.
            counted_quantity: Actual physical quantity found.
            notes: Notas del renglón; si no se manda (KEEP_NOTES) se conserva la anterior (RF-36).

        Returns:
            The updated InventoryCountItem.

        Raises:
            ValueError: If count is not active or item not found.
        """
        # Bloqueo del conteo: dos cierres o capturas simultáneas no se aplican dos veces (BE-102)
        count = (
            db.session.query(InventoryCount)
            .filter_by(id=count_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not count:
            raise CountNotFoundError()
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

        # El "esperado" es el stock en el momento de contar, no el de la creación del conteo: así el
        # ajuste por diferencia no descuenta otra vez las ventas hechas entre ambos momentos (BE-103)
        stock = (
            Stock.query.filter_by(product_id=product_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if stock is not None:
            item.expected_quantity = stock.quantity

        counted = Decimal(str(counted_quantity))
        if counted > 0 and item.product is not None:
            # Las unidades sin fracciones solo se cuentan en enteros (RF-19)
            validate_quantity(counted, item.product.unit, item.product.name)
        item.counted_quantity = counted
        item.difference = counted - item.expected_quantity
        if notes is not KEEP_NOTES:
            item.notes = notes or None

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
        # Bloqueo del conteo: dos cierres o capturas simultáneas no se aplican dos veces (BE-102)
        count = (
            db.session.query(InventoryCount)
            .filter_by(id=count_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not count:
            raise CountNotFoundError()
        if count.status not in ("pendiente", "en_proceso"):
            raise ValueError("El conteo ya está cerrado o cancelado")

        # Apply stock adjustments for counted items with differences
        # (bloqueo del stock en orden de producto antes de ajustar, OPS-09)
        to_adjust = [
            item for item in count.items
            if item.counted_quantity is not None and item.difference != Decimal("0")
        ]
        InventoryService.lock_stock(item.product_id for item in to_adjust)
        InventoryCountService._check_no_negative_stock(to_adjust)
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
        # Bloqueo del conteo: dos cierres o capturas simultáneas no se aplican dos veces (BE-102)
        count = (
            db.session.query(InventoryCount)
            .filter_by(id=count_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not count:
            raise CountNotFoundError()
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
    def _check_no_negative_stock(items) -> None:
        """Antes de aplicar nada, cada diferencia debe dejar el stock en 0 o más (RF-32).

        La diferencia se calcula contra el stock AL CAPTURAR y se aplica sobre el stock actual, así que las ventas
        posteriores se respetan. Si desde la captura salió más mercancía de la que se contó, la captura ya no es
        creíble: se pide recapturar ese producto en lugar del 409 genérico del CHECK de la base.
        """
        ids = [item.product_id for item in items]
        if not ids:
            return
        current = {
            s.product_id: s.quantity
            for s in Stock.query.filter(Stock.product_id.in_(ids)).populate_existing().all()
        }
        for item in items:
            stock = current.get(item.product_id, Decimal("0"))
            result = stock + item.difference
            if result < 0:
                name = item.product.name if item.product else f"#{item.product_id}"
                raise CountNegativeStockError(
                    f"No se puede cerrar el conteo: el ajuste de '{name}' (diferencia {_fmt(item.difference)}) "
                    f"dejaría el stock en {_fmt(result)}. Hoy hay {_fmt(stock)} porque hubo movimientos después "
                    f"de capturarlo (contado: {_fmt(item.counted_quantity)}). Vuelve a capturar ese producto.",
                    product_id=item.product_id,
                )

    @staticmethod
    def reset_capture_after_adjust(product_id: int) -> InventoryCountItem | None:
        """Un ajuste manual (absoluto) durante un conteo abierto anula la captura de ese producto (RF-32).

        Regla: el ajuste manual es una existencia física más reciente que la captura. Si al cerrar se aplicara la
        diferencia capturada sobre el stock ajustado, se descontaría dos veces (contado 8 con sistema en 10, ajuste
        a 7 → cerraba en 5). Por eso la captura vuelve a "sin contar" y se deja una nota; si se recaptura, la
        diferencia se calcula contra el stock ajustado. No hace commit: participa en la transacción del ajuste.
        Bloquea el conteo antes que el stock, en el mismo orden que close_count.
        """
        count = (
            db.session.query(InventoryCount)
            .filter(InventoryCount.status.in_(["pendiente", "en_proceso"]))
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not count:
            return None
        item = InventoryCountItem.query.filter_by(inventory_count_id=count.id, product_id=product_id).first()
        if item is None or item.counted_quantity is None:
            return None
        note = f"Captura anulada por un ajuste manual (se había contado {_fmt(item.counted_quantity)}); vuelve a contar"
        item.notes = f"{item.notes} · {note}" if item.notes else note
        item.counted_quantity = None
        item.difference = None
        return item

    @staticmethod
    def get_count(count_id: int) -> InventoryCount | None:
        """Get an inventory count by ID."""
        return db.session.get(InventoryCount, count_id)
