"""create clothing analyses table

Revision ID: f6a7b8c9d0e1
Revises: e4f1a2b3c5d6
Create Date: 2026-11-04

"""

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e4f1a2b3c5d6"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    op.create_table(
        "clothing_analyses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("clothing_id", sa.String(length=36), nullable=False),
        sa.Column("content_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("features", sa.JSON(), nullable=True),
        sa.Column("uncertainties", sa.JSON(), nullable=False),
        sa.Column("model_info", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending','done','failed','stale')",
            name=op.f("ck_clothing_analyses_status"),
        ),
        sa.ForeignKeyConstraint(
            ["clothing_id"], ["clothes.id"], name=op.f("fk_clothing_analyses_clothing_id_clothes")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clothing_analyses")),
        sa.UniqueConstraint("clothing_id", name=op.f("uq_clothing_analyses_clothing_id")),
    )


def downgrade() -> None:
    """Revert the schema change."""
    op.drop_table("clothing_analyses")
