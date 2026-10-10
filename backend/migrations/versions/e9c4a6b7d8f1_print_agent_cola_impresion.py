"""cola de impresión y agente por caja (fase 4.11, OPS-03)

Revision ID: e9c4a6b7d8f1
Revises: d8b2f5c3e4a7
Create Date: 2026-10-10 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e9c4a6b7d8f1'
down_revision = 'd8b2f5c3e4a7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('cash_registers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('print_via_agent', sa.Boolean(), nullable=False, server_default='false'))
        batch_op.add_column(sa.Column('agent_key_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('agent_last_seen_at', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'print_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cash_register_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pendiente', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['cash_register_id'], ['cash_registers.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_print_jobs_cash_register_id', 'print_jobs', ['cash_register_id'])
    op.create_index('ix_print_jobs_status', 'print_jobs', ['status'])


def downgrade():
    op.drop_index('ix_print_jobs_status', table_name='print_jobs')
    op.drop_index('ix_print_jobs_cash_register_id', table_name='print_jobs')
    op.drop_table('print_jobs')
    with op.batch_alter_table('cash_registers', schema=None) as batch_op:
        batch_op.drop_column('agent_last_seen_at')
        batch_op.drop_column('agent_key_hash')
        batch_op.drop_column('print_via_agent')
