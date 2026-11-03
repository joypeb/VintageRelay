import pytest
from sqlalchemy import select, text

from app.models.clothing import Clothing
from app.models.exchange_intent import ExchangeIntent
from app.models.trade_participant import TradeParticipant
from app.models.trade_proposal import TradeProposal
from tests.api.test_intents_register_list import assert_error
from tests.api.test_proposals_consent_conflicts import proposal_action

pytest_plugins = ("tests.api.test_proposals_consent_conflicts",)


@pytest.mark.parametrize(
    "failure,code,reason,detail_key",
    [
        ("intent", "INTENT_NOT_ACTIVE", "intent_changed", "intentId"),
        ("withdrawn", "CLOTHING_NOT_AVAILABLE", "clothing_withdrawn", "clothingId"),
        ("confirmed", "CLOTHING_ALREADY_CONFIRMED", "clothing_confirmed_elsewhere", "clothingId"),
        ("conditional", "CLOTHING_NOT_AVAILABLE", "clothing_withdrawn", "clothingId"),
        ("unique", "CLOTHING_ALREADY_CONFIRMED", "clothing_confirmed_elsewhere", "clothingId"),
    ],
)
def test_confirmation_recheck_rolls_back_consent_and_commits_invalidation(
    client, db, accepted, failure, code, reason, detail_key
):
    (_, sender, token, _, rows, intent), proposal = accepted
    garment = rows["mine_available"]["id"]
    if failure == "unique":
        from tests.api.test_proposals_reads import seed_proposal

        competing = seed_proposal(db, accepted[0][:5], "confirmed")
        with db.write() as session:
            party = session.scalar(
                select(TradeParticipant).where(
                    TradeParticipant.proposal_id == competing,
                    TradeParticipant.offered_clothing_id == garment,
                )
            )
            party.is_confirmed = True
    with db.write() as session:
        if failure == "intent":
            session.get(ExchangeIntent, intent).status = "withdrawn"
        elif failure in ("withdrawn", "confirmed"):
            session.get(Clothing, garment).status = failure
        elif failure == "conditional":
            session.execute(
                text(
                    "CREATE TRIGGER deny_confirmation BEFORE UPDATE OF status ON clothes "
                    "WHEN NEW.status = 'confirmed' BEGIN SELECT RAISE(IGNORE); END"
                )
            )
        before = {
            rows[key]["id"]: session.get(Clothing, rows[key]["id"]).status
            for key in ("mine_available", "other_available")
        }
    error = assert_error(proposal_action(client, proposal, token), 409, code)
    if failure == "conditional":
        assert error["details"][detail_key] in before
    else:
        assert error["details"][detail_key] == (intent if failure == "intent" else garment)
    with db.read() as session:
        row = session.get(TradeProposal, proposal)
        assert (row.status, row.end_reason) == ("invalidated", reason) and row.ended_at is not None
        parts = session.scalars(
            select(TradeParticipant).where(TradeParticipant.proposal_id == proposal)
        ).all()
        assert all(not part.is_confirmed for part in parts)
        caller = next(part for part in parts if part.participant_id == sender.id)
        assert caller.response == "pending" and caller.responded_at is None
        assert {key: session.get(Clothing, key).status for key in before} == before
