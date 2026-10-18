"""add must_change_password to users

Revision ID: 989f0603a546
Revises: 786e5fd0177a
Create Date: 2026-10-06 21:53:40.720766

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '989f0603a546'
down_revision = '786e5fd0177a'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('must_change_password')

