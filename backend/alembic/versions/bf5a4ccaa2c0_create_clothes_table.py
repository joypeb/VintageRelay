"""create clothes table

Revision ID: bf5a4ccaa2c0
Revises: d04c8b6d5381
Create Date: 2026-10-30

"""

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "bf5a4ccaa2c0"
down_revision: str | None = "d04c8b6d5381"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    op.create_table(
        "clothes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("photo_id", sa.String(length=36), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("content_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('available','confirmed','withdrawn')",
            name=op.f("ck_clothes_status"),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name=op.f("fk_clothes_event_id_events")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["participants.id"], name=op.f("fk_clothes_owner_id_participants")
        ),
        sa.ForeignKeyConstraint(
            ["photo_id"], ["photos.id"], name=op.f("fk_clothes_photo_id_photos")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clothes")),
        sa.UniqueConstraint("photo_id", name=op.f("uq_clothes_photo_id")),
    )
    op.create_index("ix_clothes_event_id_created_at", "clothes", ["event_id", "created_at"])


def downgrade() -> None:
    """Revert the schema change."""
    op.drop_index("ix_clothes_event_id_created_at", table_name="clothes")
    op.drop_table("clothes")
