"""create exchange intent and proposal tables

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-03

"""

import sqlalchemy as sa

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    op.create_table(
        "exchange_intents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("participant_id", sa.String(length=36), nullable=False),
        sa.Column("offered_clothing_id", sa.String(length=36), nullable=False),
        sa.Column("wanted_clothing_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("accepted_proposal_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('active','withdrawn','declined','invalidated')",
            name=op.f("ck_exchange_intents_status"),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name=op.f("fk_exchange_intents_event_id_events")
        ),
        sa.ForeignKeyConstraint(
            ["participant_id"],
            ["participants.id"],
            name=op.f("fk_exchange_intents_participant_id_participants"),
        ),
        sa.ForeignKeyConstraint(
            ["offered_clothing_id"],
            ["clothes.id"],
            name=op.f("fk_exchange_intents_offered_clothing_id_clothes"),
        ),
        sa.ForeignKeyConstraint(
            ["wanted_clothing_id"],
            ["clothes.id"],
            name=op.f("fk_exchange_intents_wanted_clothing_id_clothes"),
        ),
        sa.ForeignKeyConstraint(
            ["accepted_proposal_id"],
            ["trade_proposals.id"],
            name=op.f("fk_exchange_intents_accepted_proposal_id_trade_proposals"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exchange_intents")),
    )
    op.create_table(
        "trade_proposals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("end_reason", sa.String(length=32), nullable=True),
        sa.Column("cycle_key", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','confirmed','rejected','invalidated','cancelled')",
            name=op.f("ck_trade_proposals_status"),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name=op.f("fk_trade_proposals_event_id_events")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trade_proposals")),
    )
    op.create_index(
        "uq_pending_cycle",
        "trade_proposals",
        ["event_id", "cycle_key"],
        unique=True,
        sqlite_where=sa.text("status = 'pending'"),
    )
    op.create_table(
        "trade_participants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("proposal_id", sa.String(length=36), nullable=False),
        sa.Column("participant_id", sa.String(length=36), nullable=False),
        sa.Column("offered_clothing_id", sa.String(length=36), nullable=False),
        sa.Column("offered_content_version", sa.Integer(), nullable=False),
        sa.Column("received_clothing_id", sa.String(length=36), nullable=False),
        sa.Column("response", sa.String(length=16), nullable=False),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("is_confirmed", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint(
            "response IN ('pending','consented','rejected')",
            name=op.f("ck_trade_participants_response"),
        ),
        sa.CheckConstraint(
            "offered_clothing_id != received_clothing_id",
            name=op.f("ck_trade_participants_no_self_trade"),
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["trade_proposals.id"],
            name=op.f("fk_trade_participants_proposal_id_trade_proposals"),
        ),
        sa.ForeignKeyConstraint(
            ["participant_id"],
            ["participants.id"],
            name=op.f("fk_trade_participants_participant_id_participants"),
        ),
        sa.ForeignKeyConstraint(
            ["offered_clothing_id"],
            ["clothes.id"],
            name=op.f("fk_trade_participants_offered_clothing_id_clothes"),
        ),
        sa.ForeignKeyConstraint(
            ["received_clothing_id"],
            ["clothes.id"],
            name=op.f("fk_trade_participants_received_clothing_id_clothes"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trade_participants")),
        sa.UniqueConstraint(
            "proposal_id",
            "participant_id",
            name=op.f("uq_trade_participants_proposal_id_participant_id"),
        ),
    )
    op.create_index(
        "uq_confirmed_offered_clothing",
        "trade_participants",
        ["offered_clothing_id"],
        unique=True,
        sqlite_where=sa.text("is_confirmed = 1"),
    )


def downgrade() -> None:
    """Revert the schema change."""
    op.drop_index("uq_confirmed_offered_clothing", table_name="trade_participants")
    op.drop_table("trade_participants")
    op.drop_index("uq_pending_cycle", table_name="trade_proposals")
    op.drop_table("trade_proposals")
    op.drop_table("exchange_intents")
