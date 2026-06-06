"""Inventory service — atomic stock operations with row-level locking."""
from decimal import Decimal

from app.extensions import db
from app.models.inventory import Stock, StockMovement


class InventoryService:
    """Handles all stock mutations with SELECT FOR UPDATE to prevent races."""

    @staticmethod
    def move_stock(
        product_id: int,
        quantity,
        movement_type: str,
        reference_type: str,
        reference_id: int,
        user_id: int,
        notes: str | None = None,
    ) -> Stock:
        """Execute an atomic stock movement.

        Args:
            product_id: Product to move stock for.
            quantity: Amount to add/subtract/set.
            movement_type: "entrada" | "salida" | "ajuste".
            reference_type: Source of the movement (venta, compra, conteo, etc.).
            reference_id: ID of the source record.
            user_id: User performing the operation.
            notes: Optional notes.

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
        elif movement_type == "salida":
            if stock.quantity < quantity:
                raise ValueError(
                    f"Stock insuficiente: {stock.quantity} disponible, "
                    f"{quantity} solicitado"
                )
            stock.quantity -= quantity
        elif movement_type == "ajuste":
            stock.quantity = quantity
        else:
            raise ValueError(f"Tipo de movimiento no válido: {movement_type}")

        movement = StockMovement(
            product_id=product_id,
            movement_type=movement_type,
            quantity=quantity,
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
