"""impresora por caja registradora (fase 4.2, H-22)

Revision ID: a4f2c1d0e9b8
Revises: d4e5f6a7b8c9
Create Date: 2026-10-10 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4f2c1d0e9b8'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('cash_registers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('printer_path', sa.String(length=255), nullable=True))
        batch_op.add_column(
            sa.Column('printer_codepage', sa.String(length=10), nullable=False, server_default='cp850')
        )


def downgrade():
    with op.batch_alter_table('cash_registers', schema=None) as batch_op:
        batch_op.drop_column('printer_codepage')
        batch_op.drop_column('printer_path')
