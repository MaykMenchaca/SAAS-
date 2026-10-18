"""add session_id and refund_method to sale_returns

Revision ID: 8d492bbd291e
Revises: e5c2b1890a12
Create Date: 2026-10-07 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8d492bbd291e'
down_revision = 'e5c2b1890a12'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('sale_returns', schema=None) as batch_op:
        batch_op.add_column(sa.Column('session_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('refund_method', sa.String(length=30), server_default='efectivo', nullable=False))
        batch_op.create_index(batch_op.f('ix_sale_returns_session_id'), ['session_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_sale_returns_session_id_cash_register_sessions',
            'cash_register_sessions',
            ['session_id'],
            ['id'],
        )


def downgrade():
    with op.batch_alter_table('sale_returns', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sale_returns_session_id_cash_register_sessions', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_sale_returns_session_id'))
        batch_op.drop_column('refund_method')
        batch_op.drop_column('session_id')
