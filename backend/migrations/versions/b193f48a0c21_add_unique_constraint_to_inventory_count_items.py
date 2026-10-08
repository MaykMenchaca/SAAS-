"""add unique constraint to inventory_count_items

Revision ID: b193f48a0c21
Revises: 8d492bbd291e
Create Date: 2026-10-08 00:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b193f48a0c21'
down_revision = '8d492bbd291e'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('inventory_count_items', schema=None) as batch_op:
        batch_op.create_unique_constraint(
            'uq_inventory_count_items_count_product',
            ['inventory_count_id', 'product_id']
        )


def downgrade():
    with op.batch_alter_table('inventory_count_items', schema=None) as batch_op:
        batch_op.drop_constraint('uq_inventory_count_items_count_product', type_='unique')
