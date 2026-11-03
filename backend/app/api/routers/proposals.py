from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials

from app.api.deps import (
    DbDep,
    SettingsDep,
    bearer_scheme,
    get_current_participant,
    get_token_participant,
)
from app.api.errors import error_responses
from app.schemas.proposal import Proposal, ProposalList
from app.services import proposal as proposal_service

router = APIRouter(tags=["proposals"])

ProposalStatusFilter = Literal["pending", "confirmed", "rejected", "invalidated", "cancelled"]


@router.get(
    "/events/{event_id}/proposals",
    operation_id="listProposals",
    summary="List my exchange proposals",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 422, 500),
    },
)
def list_proposals(
    event_id: str,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    status: Annotated[list[ProposalStatusFilter] | None, Query()] = None,
    clothing_id: Annotated[str | None, Query(alias="clothingId")] = None,
) -> ProposalList:
    participant = get_current_participant(event_id, db, credentials)
    return proposal_service.list_proposals(
        db, settings, event_id, participant, list(status) if status else None, clothing_id
    )


@router.get(
    "/proposals/{proposal_id}",
    operation_id="getProposal",
    summary="Read one exchange proposal",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(401, 404, 500),
    },
)
def get_proposal(
    proposal_id: str,
    db: DbDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> Proposal:
    participant = get_token_participant(db, credentials)
    return proposal_service.get_proposal(db, settings, participant, proposal_id)
