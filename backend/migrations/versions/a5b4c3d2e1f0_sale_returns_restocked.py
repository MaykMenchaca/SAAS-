"""sale_returns.restocked: regresar o no el artículo al inventario en una devolución

Revision ID: a5b4c3d2e1f0
Revises: c9d0e1f2a3b4
Create Date: 2026-10-12 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a5b4c3d2e1f0'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade():
    # Las devoluciones anteriores reingresaron stock: quedan en true
    op.add_column(
        'sale_returns',
        sa.Column('restocked', sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade():
    op.drop_column('sale_returns', 'restocked')
