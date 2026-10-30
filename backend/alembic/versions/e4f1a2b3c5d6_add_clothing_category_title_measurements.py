"""add clothing category title and measurements

Revision ID: e4f1a2b3c5d6
Revises: c9f3e2a4b1d7
Create Date: 2026-10-30

"""

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "e4f1a2b3c5d6"
down_revision: str | None = "c9f3e2a4b1d7"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    with op.batch_alter_table("clothes") as batch_op:
        batch_op.add_column(sa.Column("title", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("category", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("measure_total_length", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("measure_chest", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("measure_shoulder", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("measure_sleeve", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("measure_waist", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("measure_hem", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("measure_inseam", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("measure_thigh", sa.Float(), nullable=True))
    op.execute(text("UPDATE clothes SET title = description WHERE title IS NULL"))
    op.execute(text("UPDATE clothes SET category = 'other' WHERE category IS NULL"))
    with op.batch_alter_table("clothes") as batch_op:
        batch_op.alter_column("title", existing_type=sa.String(length=100), nullable=False)
        batch_op.alter_column("category", existing_type=sa.String(length=16), nullable=False)
        batch_op.create_check_constraint(
            op.f("ck_clothes_category"),
            "category IN ('top','outer','bottom','other')",
        )


def downgrade() -> None:
    """Revert the schema change."""
    with op.batch_alter_table("clothes") as batch_op:
        batch_op.drop_constraint(op.f("ck_clothes_category"), type_="check")
        batch_op.drop_column("measure_thigh")
        batch_op.drop_column("measure_inseam")
        batch_op.drop_column("measure_hem")
        batch_op.drop_column("measure_waist")
        batch_op.drop_column("measure_sleeve")
        batch_op.drop_column("measure_shoulder")
        batch_op.drop_column("measure_chest")
        batch_op.drop_column("measure_total_length")
        batch_op.drop_column("category")
        batch_op.drop_column("title")
