from app.schemas.common import ApiModel, UtcDatetime
from app.schemas.intent import ClothingSummary, IntentOwner


class ProposalParticipant(ApiModel):
    participant: IntentOwner
    is_me: bool
    offered_clothing: ClothingSummary
    received_clothing: ClothingSummary
    response: str
    responded_at: UtcDatetime | None = None


class Proposal(ApiModel):
    id: str
    event_id: str
    version: int
    status: str
    end_reason: str | None = None
    cycle_size: int
    participants: list[ProposalParticipant]
    my_response: str
    can_consent: bool
    can_reject: bool
    can_cancel: bool
    created_at: UtcDatetime
    confirmed_at: UtcDatetime | None = None
    cancelled_at: UtcDatetime | None = None
    ended_at: UtcDatetime | None = None


class ProposalList(ApiModel):
    items: list[Proposal]
    next_cursor: None = None
