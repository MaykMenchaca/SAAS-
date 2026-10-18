"""constraints CHECK e índices para reportes y auditoría (fase 6.5, H-33)

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-10-11 13:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'c9d0e1f2a3b4'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_check_constraint('ck_stock_quantity_nonneg', 'stock', 'quantity >= 0')
    op.create_check_constraint('ck_payments_amount_pos', 'payments', 'amount > 0')
    op.create_check_constraint('ck_payments_change_nonneg', 'payments', 'change_amount >= 0')

    op.create_index('ix_sales_created_at', 'sales', ['created_at'])
    op.create_index('ix_stock_movements_created_at', 'stock_movements', ['created_at'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_entity', 'audit_logs', ['entity_type', 'entity_id'])
    op.create_index('ix_sale_return_items_sale_item_id', 'sale_return_items', ['sale_item_id'])
    # idx_products_name_trgm ya existe desde 786e5fd0177a; ahora también está declarado en el modelo


def downgrade():
    op.drop_index('ix_sale_return_items_sale_item_id', table_name='sale_return_items')
    op.drop_index('ix_audit_logs_entity', table_name='audit_logs')
    op.drop_index('ix_audit_logs_user_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    op.drop_index('ix_stock_movements_created_at', table_name='stock_movements')
    op.drop_index('ix_sales_created_at', table_name='sales')
    op.drop_constraint('ck_payments_change_nonneg', 'payments', type_='check')
    op.drop_constraint('ck_payments_amount_pos', 'payments', type_='check')
    op.drop_constraint('ck_stock_quantity_nonneg', 'stock', type_='check')
