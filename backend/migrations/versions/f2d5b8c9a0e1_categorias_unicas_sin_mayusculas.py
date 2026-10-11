"""unificar categorías duplicadas por mayúsculas y proveedor "Sin Proveedor" (fase 5.4, H-54)

Revision ID: f2d5b8c9a0e1
Revises: e9c4a6b7d8f1
Create Date: 2026-10-10 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2d5b8c9a0e1'
down_revision = 'e9c4a6b7d8f1'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Categorías que solo difieren en mayúsculas/espacios: se conserva la más antigua (menor id)
    op.execute(
        """
        WITH grupos AS (
            SELECT id, min(id) OVER (PARTITION BY lower(trim(name))) AS keep_id FROM categories
        )
        UPDATE products p SET category_id = g.keep_id
        FROM grupos g
        WHERE p.category_id = g.id AND g.id <> g.keep_id
        """
    )
    op.execute(
        """
        DELETE FROM categories c
        USING (SELECT id, min(id) OVER (PARTITION BY lower(trim(name))) AS keep_id FROM categories) g
        WHERE c.id = g.id AND g.id <> g.keep_id
        """
    )
    op.execute("UPDATE categories SET name = trim(name) WHERE name <> trim(name)")
    op.create_index('uq_categories_name_ci', 'categories', [sa.text('lower(trim(name))')], unique=True)

    # 2. Proveedor "Sin Proveedor" duplicado: se reasignan sus órdenes al más antiguo
    op.execute(
        """
        WITH dup AS (
            SELECT id, min(id) OVER () AS keep_id FROM suppliers
            WHERE lower(trim(name)) = 'sin proveedor'
        )
        UPDATE purchase_orders o SET supplier_id = d.keep_id
        FROM dup d WHERE o.supplier_id = d.id AND d.id <> d.keep_id
        """
    )
    op.execute(
        """
        DELETE FROM suppliers s
        USING (SELECT id, min(id) OVER () AS keep_id FROM suppliers WHERE lower(trim(name)) = 'sin proveedor') d
        WHERE s.id = d.id AND d.id <> d.keep_id
        """
    )


def downgrade():
    # La unificación de datos no se revierte; solo se quita el índice
    op.drop_index('uq_categories_name_ci', table_name='categories')
