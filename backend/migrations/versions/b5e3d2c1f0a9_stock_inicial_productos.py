"""stock inicial para productos sin registro de stock (fase 4.4, H-26)

Revision ID: b5e3d2c1f0a9
Revises: a4f2c1d0e9b8
Create Date: 2026-10-10 19:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'b5e3d2c1f0a9'
down_revision = 'a4f2c1d0e9b8'
branch_labels = None
depends_on = None


def upgrade():
    # Productos dados de alta antes de la 4.4 que nunca tuvieron movimiento: no tenían fila en stock
    op.execute(
        """
        INSERT INTO stock (product_id, quantity, last_updated)
        SELECT p.id, 0, now()
        FROM products p
        LEFT JOIN stock s ON s.product_id = p.id
        WHERE s.id IS NULL
        """
    )
    # avg_cost = purchase_price solo para productos sin ningún movimiento de inventario
    op.execute(
        """
        UPDATE products p
        SET avg_cost = p.purchase_price
        WHERE p.avg_cost = 0
          AND p.purchase_price > 0
          AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id)
        """
    )


def downgrade():
    # Migración de datos: no se revierte (las filas en 0 son válidas con el esquema anterior)
    pass
