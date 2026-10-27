# API Rules

Follow [../common/api-contract.md](../common/api-contract.md) for the frontend contract, including path naming, error formats, JSON casing, and dates. This document covers only FastAPI implementation rules. Per-function paths and request/response details are specified in [docs/plans/api/](../../../plans/api/README.md); items marked **proposed** there still need agreement.

## Routers

- Define one `APIRouter` per resource with `prefix` and `tags`. Mount all routers under `/api/v1`.
- Keep route functions **thin**: receive dependencies → call service → return result. Move logic to a service if a route exceeds 10 lines.
- **MUST:** declare response models on every route (return annotation or `response_model`). **No** returning dicts/ORM objects.
- Explicitly use `status_code=201` for creation and `204` for successful responses without bodies.
- **Do not** raise `HTTPException` directly in routers. Raise domain exceptions for global handlers to convert (→ [error-handling.md](error-handling.md)).

```python
router = APIRouter(prefix="/events/{event_id}/clothes", tags=["clothes"])

@router.post("", status_code=201)
def create_clothing(
    body: ClothingCreate,
    me: CurrentParticipant,
    service: ClothingServiceDep,
) -> ClothingRead:
    return service.create(me, body)
```

## Dependency Injection

Centralize dependencies in `api/deps.py` and expose `Annotated` aliases.

```python
DbSession = Annotated[Db, Depends(get_db)]   # Provides read()/write() (database.md)
CurrentParticipant = Annotated[Participant, Depends(get_current_participant)]
Organizer = Annotated[Participant, Depends(require_organizer)]

def get_clothing_service(db: DbSession) -> ClothingService:
    return ClothingService(db)

ClothingServiceDep = Annotated[ClothingService, Depends(get_clothing_service)]
```

- `get_db` supplies one `Db` per request. Services open transactions with `with db.read()` or `with db.write()` (→ [database.md](database.md#transactions)).
- Inject `Settings` and AI clients too, allowing tests to replace them through `app.dependency_overrides`.
- **No** module-global state (global sessions or cache dicts).

## Authorization Check Locations

Entry codes/QR codes are **only event entry mechanisms**, not participant/organizer authorization. Requests authenticate with [bearer-token authentication](../common/api-contract.md#authentication-decided) (`Authorization: Bearer <participantToken>`, no cookies). Isolate token lookup in `deps.py`. Only session recovery on another device remains undecided.

| Check | Location | Example |
|---|---|---|
| Who made the request (token → participant)? | `deps.get_current_participant` | Missing/unknown token → 401 |
| Does the participant belong to the event in the path? | `deps.get_current_participant` | Participant from another event → 404 |
| Is the participant the organizer? | `deps.require_organizer` | `event.organizer_participant_id != me.id` → 403 |
| Does the participant own this garment/intent? | Service | Editing another's garment → 403; another's intent → 404 (existence hidden) |
| Is the participant a party to this proposal? | Service | Not a party → 404 (existence hidden) |
| Is the event active? | Service, inside write transaction | Closed event → 409 |

- **MUST:** verify path `event_id` matches the token participant's `event_id` in the dependency.
- **MUST:** return `404` instead of `403` only to hide private resources (proposals the caller is not in, photos uploaded by others); see the contract.
- Check ownership/event state **in services** because data must be read, and inside the same transaction for writes. **Do not** check only in routers without rechecking in services (race condition).
- Service methods take the actor (`actor: Participant`) first. **No** mutating service methods without an actor.
- **MUST:** store only the token hash and never log tokens. **Do not** use cookies for sessions. Mark session-recovery code with `# TODO(undecided): session recovery`.

## Requests and Responses

- Follow the shared contract for lists. If not specified there, wrap arrays in objects (`{"items": [...]}`) and add pagination when needed.
- **Do not** expose other participants' session tokens, internal paths, or sensitive data. Return only values needed by screens, such as organizer status.
- **MUST:** include `version` and each participant's offered/received garments in proposals. Consent sends this version unchanged; reject mismatches with 409.
- **MUST:** implement consent, rejection, cancellation, closure, and intent registration idempotently per the shared duplicate-handling table ([../common/api-contract.md](../common/api-contract.md), 5-1). Determine whether the target state already holds inside the write transaction.

### Accepting Alternative Garment Suggestions

Suggestions are calculated on demand, not stored; other participants' clothing/intents may have changed since viewing.

- **MUST:** accept with the opaque suggestion ID only (no body; [10](../../../plans/api/10-alternative-suggestions.md)). The ID is server-signed and encodes `intentId`, `wantedClothingId`, the offered garment at suggestion time (`fromClothingId`), the suggested garment (`toClothingId`), and the cycle. Reject an ID whose signature does not verify with 404.
- **MUST:** after verifying the signature and that the intent belongs to the actor (404 otherwise), run the replay check before any state check: if the intent already offers `toClothingId` and a proposal for the suggested cycle exists in any state, return 200 with the current intent and that cycle's latest proposal.
- **MUST:** verify all of the following in one write transaction before changing the intent. On any failure, leave the intent unchanged and return 409 (frontend reloads suggestions).
  1. Event active, intent owned by the actor and valid, and current offered garment equals `fromClothingId`.
  2. `toClothingId` belongs to the actor and is available.
  3. The actor has no other active intent for (`toClothingId`, `wantedClothingId`).
  4. The changed intent completes a two-/three-person cycle **now**, recalculated with `domain/matching.py`.
- After changing the intent, invalidate affected unconfirmed proposals and recalculate in the same transaction ([database.md](database.md#proposal-creation-and-deduplication)).
- Acceptance is not final consent. Newly created proposals start pending consent.
- **MUST:** receive photos with `UploadFile` and validate MIME (`image/jpeg`, `image/png`, `image/webp`) and configurable size limit (`MAX_PHOTO_BYTES`; proposed default 10MB, see [05](../../../plans/api/05-upload-photo.md)). Generate UUID filenames server-side; never use original filenames as paths.
- Keep OpenAPI (`/docs`) enabled for development/demos. Adding route `summary` descriptions for frontend reference is recommended.
