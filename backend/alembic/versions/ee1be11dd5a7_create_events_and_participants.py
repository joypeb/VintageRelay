"""create events and participants

Revision ID: ee1be11dd5a7
Revises:
Create Date: 2026-10-28 15:55:54.801769

"""

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "ee1be11dd5a7"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    op.create_table(
        "events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("entry_code", sa.String(length=6), nullable=False),
        sa.Column("organizer_participant_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("status IN ('active','closed')", name=op.f("ck_events_status")),
        sa.ForeignKeyConstraint(
            ["organizer_participant_id"],
            ["participants.id"],
            name=op.f("fk_events_organizer_participant_id_participants"),
            use_alter=True,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_events")),
        sa.UniqueConstraint("entry_code", name=op.f("uq_events_entry_code")),
    )
    op.create_table(
        "participants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("display_name", sa.String(length=30), nullable=False),
        sa.Column("session_token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name=op.f("fk_participants_event_id_events")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_participants")),
        sa.UniqueConstraint("session_token_hash", name=op.f("uq_participants_session_token_hash")),
    )


def downgrade() -> None:
    """Revert the schema change."""
    op.drop_table("participants")
    op.drop_table("events")
