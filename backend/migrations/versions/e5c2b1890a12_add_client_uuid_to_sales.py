"""add client_uuid to sales

Revision ID: e5c2b1890a12
Revises: 989f0603a546
Create Date: 2026-10-07 23:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5c2b1890a12'
down_revision = '989f0603a546'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sales', schema=None) as batch_op:
        batch_op.add_column(sa.Column('client_uuid', sa.String(length=36), nullable=True))
        batch_op.create_index(batch_op.f('ix_sales_client_uuid'), ['client_uuid'], unique=True)


def downgrade():
    with op.batch_alter_table('sales', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sales_client_uuid'))
        batch_op.drop_column('client_uuid')
