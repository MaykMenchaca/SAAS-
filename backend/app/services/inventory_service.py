"""Inventory service — atomic stock operations with row-level locking."""
from decimal import Decimal

from app.extensions import db
from app.models.inventory import Stock, StockMovement
from app.utils.decorators import with_rollback


class InventoryService:
    """Handles all stock mutations with SELECT FOR UPDATE to prevent races."""

    @staticmethod
    def lock_stock(product_ids) -> None:
        """Bloquea las filas de stock en orden de product_id antes de moverlas.

        Dos operaciones con los mismos productos en distinto orden ([A,B] y [B,A]) toman los
        bloqueos en el mismo orden y no hacen deadlock (OPS-09).
        """
        ids = sorted({int(pid) for pid in product_ids})
        if ids:
            (
                Stock.query.filter(Stock.product_id.in_(ids))
                .order_by(Stock.product_id)
                .with_for_update()
                .all()
            )

    @staticmethod
    @with_rollback
    def move_stock(
        product_id: int,
        quantity,
        movement_type: str,
        reference_type: str,
        reference_id: int,
        user_id: int,
        notes: str | None = None,
        is_delta: bool = False,
    ) -> Stock:
        """Execute an atomic stock movement.

        Args:
            product_id: Product to move stock for.
            quantity: Amount to add/subtract/set, or delta if is_delta is True. En un ajuste, el movimiento
                guarda el cambio con signo (RF-33).
            movement_type: "entrada" | "salida" | "ajuste".
            reference_type: Source of the movement (venta, compra, conteo, etc.).
            reference_id: ID of the source record.
            user_id: User performing the operation.
            notes: Optional notes.
            is_delta: If True and movement_type is "ajuste", quantity is applied as a delta.

        Returns:
            The updated Stock record.

        Raises:
            ValueError: If salida exceeds available stock.
        """
        quantity = Decimal(str(quantity))

        # Row-level lock to prevent concurrent modifications
        stock = (
            Stock.query
            .filter_by(product_id=product_id)
            .with_for_update()
            .first()
        )

        if not stock:
            stock = Stock(product_id=product_id, quantity=Decimal("0.000"))
            db.session.add(stock)
            db.session.flush()

        previous_stock = stock.quantity

        if movement_type == "entrada":
            stock.quantity += quantity
            movement_qty = quantity
        elif movement_type == "salida":
            if stock.quantity < quantity:
                raise ValueError(
                    f"Stock insuficiente: {stock.quantity} disponible, "
                    f"{quantity} solicitado"
                )
            stock.quantity -= quantity
            movement_qty = quantity
        elif movement_type == "ajuste":
            new_quantity = previous_stock + quantity if is_delta else quantity
            if new_quantity < 0:
                # Antes chocaba con el CHECK de la BD y salía un 409 genérico sin decir qué producto (RF-32)
                raise ValueError(
                    f"El ajuste dejaría el stock en {new_quantity} (actual: {previous_stock})"
                )
            stock.quantity = new_quantity
            # En un ajuste, `quantity` es el cambio con signo (nuevo − anterior), no el stock nuevo ni el
            # valor absoluto de la diferencia (RF-33). Entradas y salidas siguen siendo positivas
            movement_qty = new_quantity - previous_stock
        else:
            raise ValueError(f"Tipo de movimiento no válido: {movement_type}")

        movement = StockMovement(
            product_id=product_id,
            movement_type=movement_type,
            quantity=movement_qty,
            previous_stock=previous_stock,
            new_stock=stock.quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            user_id=user_id,
            notes=notes,
        )
        db.session.add(movement)

        return stock

    @staticmethod
    def get_stock(product_id: int) -> Stock | None:
        """Get current stock for a product."""
        return Stock.query.filter_by(product_id=product_id).first()

    @staticmethod
    def get_movements(product_id: int, limit: int = 50):
        """Get recent stock movements for a product."""
        return (
            StockMovement.query
            .filter_by(product_id=product_id)
            .order_by(StockMovement.created_at.desc())
            .limit(limit)
            .all()
        )
