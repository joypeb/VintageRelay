"""create photos table

Revision ID: d04c8b6d5381
Revises: 8e658c89f7b9
Create Date: 2026-10-30

"""

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "d04c8b6d5381"
down_revision: str | None = "8e658c89f7b9"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    op.create_table(
        "photos",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("uploader_id", sa.String(length=36), nullable=False),
        sa.Column("storage_location", sa.String(length=64), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name=op.f("fk_photos_event_id_events")
        ),
        sa.ForeignKeyConstraint(
            ["uploader_id"],
            ["participants.id"],
            name=op.f("fk_photos_uploader_id_participants"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_photos")),
        sa.UniqueConstraint("storage_location", name=op.f("uq_photos_storage_location")),
    )
    op.create_index("ix_photos_event_id", "photos", ["event_id"])


def downgrade() -> None:
    """Revert the schema change."""
    op.drop_index("ix_photos_event_id", table_name="photos")
    op.drop_table("photos")
