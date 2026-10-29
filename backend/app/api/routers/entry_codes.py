from fastapi import APIRouter

from app.api.deps import EventServiceDep
from app.api.errors import error_responses
from app.schemas.event import EntryCodePreview

router = APIRouter(prefix="/entry-codes", tags=["entry-codes"])


@router.get(
    "/{entry_code}",
    operation_id="lookupEntryCode",
    summary="Preview an event by entry code",
    responses={
        200: {
            "headers": {"X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}}
        },
        **error_responses(404, 500),
    },
)
def lookup_entry_code(entry_code: str, service: EventServiceDep) -> EntryCodePreview:
    return service.lookup_entry_code(entry_code)
