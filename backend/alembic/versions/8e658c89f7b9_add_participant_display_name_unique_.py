"""add participant display name unique index

Revision ID: 8e658c89f7b9
Revises: ee1be11dd5a7
Create Date: 2026-10-30 00:10:40.684168

"""

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "8e658c89f7b9"
down_revision: str | None = "ee1be11dd5a7"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    op.create_index(
        "uq_participants_event_id_display_name_lower",
        "participants",
        ["event_id", sa.text("lower(display_name)")],
        unique=True,
    )


def downgrade() -> None:
    """Revert the schema change."""
    op.drop_index("uq_participants_event_id_display_name_lower", table_name="participants")
