"""sale_items.cost_at_sale con 4 decimales, igual que products.avg_cost (fase 4.14)

Revision ID: a1b3c5d7e9f2
Revises: e9c4a6b7d8f1
Create Date: 2026-10-11 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b3c5d7e9f2'
down_revision = 'e9c4a6b7d8f1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sale_items', schema=None) as batch_op:
        batch_op.alter_column(
            'cost_at_sale',
            existing_type=sa.Numeric(precision=12, scale=2),
            type_=sa.Numeric(precision=12, scale=4),
            existing_nullable=False,
        )


def downgrade():
    with op.batch_alter_table('sale_items', schema=None) as batch_op:
        batch_op.alter_column(
            'cost_at_sale',
            existing_type=sa.Numeric(precision=12, scale=4),
            type_=sa.Numeric(precision=12, scale=2),
            existing_nullable=False,
        )
