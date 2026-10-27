# Read Confirmation/Handover API

Shows who gives and receives which garment in confirmed exchanges, and keeps confirmation distinct from physical handover. Screens: T1 (Confirmed), T3. Common rules: [README](README.md).

This function reuses the proposal read endpoints in [11-proposals.md](11-proposals.md); no separate resource is introduced in v1.

## Endpoints

| Use | Request |
|---|---|
| T1 Confirmed segment | `GET /api/v1/events/{event_id}/proposals?status=confirmed` |
| T3 detail | `GET /api/v1/proposals/{proposal_id}` |
| C4 confirmed garment link | `GET /api/v1/events/{event_id}/proposals?status=confirmed&clothingId={clothing_id}` |

### Headers

`Authorization: Bearer <participantToken>` (required), `X-Request-ID` (optional).

### Response

`Proposal` objects ([schema](11-proposals.md#proposal-schema)) with `status = confirmed`. T3 uses:

| Field | Use |
|---|---|
| `participants[].participant.displayName` | Whom to meet on site |
| `participants[].offeredClothing` / `receivedClothing` | What each person gives and receives, including photos for inspection |
| `participants[].isMe` | Highlight the caller's give/receive pair |
| `confirmedAt` | Confirmation time |
| `canCancel` | Show [Cancel exchange] only while the event is active |

### Confirmation vs. Handover

- `status = confirmed` means every participant consented. It does **not** mean garments were handed over.
- v1 has no handover state or endpoint. T3 always shows the notice: "Confirmed. Inspect the garments in person before handing them over."
- If handover recording is decided later, add fields (for example, per-participant `handedOverAt`) and an action endpoint here.

### After Closure

- Confirmed proposals stay `confirmed` and remain readable (proposed initial design). `canCancel` is `false`.
- Pending proposals were invalidated at closure and appear under History (**proposed** closure handling).

### Errors

Same as [11-proposals.md](11-proposals.md).

## Open Decisions

- Who records completed handover, and how.
- Post-closure access duration and retention of confirmed records.
- Whether the organizer can view all confirmed exchanges (M1 currently shows only the count).
