"""email de usuario opcional (fase 4.5, H-28)

Revision ID: c7a1e4b2d3f6
Revises: b5e3d2c1f0a9
Create Date: 2026-10-10 19:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7a1e4b2d3f6'
down_revision = 'b5e3d2c1f0a9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('email', existing_type=sa.String(length=120), nullable=True)


def downgrade():
    # Falla si hay usuarios sin email: asígnales uno antes de revertir
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('email', existing_type=sa.String(length=120), nullable=False)
