"""sesión abierta única por caja y avg_cost con 4 decimales (fase 4.6, H-31)

Revision ID: d8b2f5c3e4a7
Revises: c7a1e4b2d3f6
Create Date: 2026-10-10 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd8b2f5c3e4a7'
down_revision = 'c7a1e4b2d3f6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    duplicadas = conn.execute(sa.text(
        "SELECT cash_register_id FROM cash_register_sessions "
        "WHERE status = 'abierta' GROUP BY cash_register_id HAVING count(*) > 1"
    )).scalars().all()
    if duplicadas:
        raise RuntimeError(
            "No se puede crear uq_cash_session_open: las cajas "
            f"{duplicadas} tienen más de una sesión abierta. Ciérralas antes de migrar."
        )

    op.create_index(
        'uq_cash_session_open',
        'cash_register_sessions',
        ['cash_register_id'],
        unique=True,
        postgresql_where=sa.text("status = 'abierta'"),
    )
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.alter_column(
            'avg_cost',
            existing_type=sa.Numeric(precision=12, scale=2),
            type_=sa.Numeric(precision=12, scale=4),
            existing_nullable=False,
        )


def downgrade():
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.alter_column(
            'avg_cost',
            existing_type=sa.Numeric(precision=12, scale=4),
            type_=sa.Numeric(precision=12, scale=2),
            existing_nullable=False,
        )
    op.drop_index('uq_cash_session_open', table_name='cash_register_sessions')
