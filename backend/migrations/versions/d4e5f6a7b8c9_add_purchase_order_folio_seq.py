"""add purchase_order_folio_seq

Revision ID: d4e5f6a7b8c9
Revises: c28471e981aa
Create Date: 2026-10-10 15:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = 'c28471e981aa'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE SEQUENCE IF NOT EXISTS purchase_order_folio_seq START 1")


def downgrade():
    op.execute("DROP SEQUENCE IF EXISTS purchase_order_folio_seq")
