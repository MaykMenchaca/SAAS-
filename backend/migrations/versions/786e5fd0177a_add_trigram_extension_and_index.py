"""add_trigram_extension_and_index

Revision ID: 786e5fd0177a
Revises: 72a63466f110
Create Date: 2026-06-14 22:25:06.491920

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '786e5fd0177a'
down_revision = '72a63466f110'
branch_labels = None
depends_on = None


def upgrade():
    # Enable pg_trgm extension
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # Create GIN index on products table name column
    op.execute("CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_products_name_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
