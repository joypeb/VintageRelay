# Vintage Relay Draft Database Table Design

## 1. Purpose and Scope

Describe data for entry, clothing registration, AI recommendations, two-/three-person exchanges, consent, cancellation, and closure. The design uses **nine core tables**, with SQLite planned for the first version.

This is a draft of tables/key data. Actual SQL, types, and indexes will be settled in detailed design. API requests/responses are specified in [api/](api/README.md); authentication follows the [API contract](../rules/dev/common/api-contract.md#authentication-decided). See [PROJECT.md](../../PROJECT.md) for behavior and [vintage-relay-plan-v1.md](vintage-relay-plan-v1.md) for APIs/scope.

## 2. Core Tables

| Table | Purpose |
|---|---|
| `events` | Events and lifecycle state |
| `participants` | Participants who joined events |
| `clothes` | Registered garments and availability |
| `photos` | Uploaded photos and their attachment to garments |
| `clothing_analyses` | AI-extracted features and uncertainties |
| `preferences` | Raw preferences and interpretations |
| `exchange_intents` | Offered/desired garment combinations |
| `trade_proposals` | Two-/three-person proposals and version states |
| `trade_participants` | Offered/received garments and final responses per proposal participant |

## 3. Key Data by Table

Field names are illustrative drafts and may change during implementation. `PK` identifies a row; `FK` references another table.

### 3.1 `events` — Events

| Data | Description |
|---|---|
| `id` (PK) | Event identifier |
| `name` | Event name |
| `organizer_participant_id` (FK) | Creator's participant ID, referencing `participants.id` |
| `entry_code` | Code participants use to join |
| `status` | Active or closed |
| `created_at`, `closed_at` | Creation/closure timestamps |

Creating an event registers its creator as a participant and stores that ID in `organizer_participant_id`. Organizers must belong to their own events. Completed creation activates the event immediately. Generate QR codes from entry links; no separate table is required. Organizer authority comes from the participant token of `organizer_participant_id`; session recovery will be decided separately. Entry codes alone do not grant organizer permissions.

`participants.event_id` references events, while `events.organizer_participant_id` references participants. Create the event, register the organizer, and link the ID in **one transaction**. For example, temporarily leave the organizer ID empty, create the participant, then fill it. Roll back all creation if linking fails; never expose an active event without an organizer. Detailed design will settle temporary nullability and foreign key implementation.

### 3.2 `participants` — Participants

| Data | Description |
|---|---|
| `id` (PK) | Participant identifier |
| `event_id` (FK) | Joined event |
| `display_name` | Name displayed in event; unique per event, case-insensitive |
| `session_token_hash` | Hash of the participant's bearer token; never the raw token |
| `created_at` | Join timestamp |

Events have multiple participants, including the organizer. Each may register multiple garments/intents. Event creation and join issue one token per participant; requests send it as `Authorization: Bearer <participantToken>`, and the server looks up the participant by `session_token_hash` (unique). Identity verification and session recovery remain undecided.

### 3.3 `clothes` — Clothing

| Data | Description |
|---|---|
| `id` (PK) | Clothing identifier |
| `event_id` (FK) | Registration event |
| `owner_id` (FK) | Registering participant |
| `photo_id` (FK) | Attached photo, referencing `photos.id` |
| `description` | Owner-written description |
| `status` | `available`, `confirmed`, `withdrawn` |
| `content_version` | Version of photo/description content |
| `created_at`, `updated_at` | Registration/change timestamps |

Consider `clothing_photos` if multiple photos become necessary. Store participant descriptions separately from AI estimates.

### 3.4 `photos` — Uploaded Photos

| Data | Description |
|---|---|
| `id` (PK) | Photo identifier |
| `event_id` (FK) | Upload event |
| `uploader_id` (FK) | Uploading participant |
| `storage_location` | Storage key/URL (unguessable) |
| `content_type`, `size_bytes` | Stored MIME type and size |
| `created_at` | Upload timestamp |

Photos are uploaded before clothing registration and attached through `clothes.photo_id`. A photo can be attached to at most one garment (unique `clothes.photo_id`). Only the uploader can attach it, within the same event. Retention/deletion of replaced or never-attached photos remains undecided.

### 3.5 `clothing_analyses` — AI Clothing Analysis

| Data | Description |
|---|---|
| `id` (PK) | Analysis identifier |
| `clothing_id` (FK) | Analyzed garment |
| `content_version` | Photo/description version analyzed |
| `features` | Structured estimated type, color, features, etc. |
| `uncertainties` | Matters not verifiable from photos/descriptions |
| `confirmed_features` | Participant-reviewed/corrected features |
| `status` | Pending, done, failed, stale, etc. |
| `model_info` | Model used |
| `created_at` | Analysis timestamp |

For example, store “likely a green jacket” in `features` and “check whether a logo is present” in `uncertainties`. **Unverified does not mean absent.** Photo/description changes make old analyses stale and require reanalysis. If the source changes during analysis, never display old-version results as current.

### 3.6 `preferences` — Participant Preferences

| Data | Description |
|---|---|
| `id` (PK) | Preference identifier |
| `participant_id` (FK) | Participant who entered preferences |
| `original_text` | Original preferences/exclusions |
| `interpreted_conditions` | AI-structured conditions |
| `confirmed_conditions` | Participant-reviewed/corrected conditions |
| `version` | Preference change version |
| `updated_at` | Last change timestamp |

Separate original text and AI interpretation; allow participant review/correction. The first version proposes managing each participant's current preferences.

### 3.7 `exchange_intents` — Exchange Intents

| Data | Description |
|---|---|
| `id` (PK) | Intent identifier |
| `participant_id` (FK) | Selecting participant |
| `offered_clothing_id` (FK) | Garment they offer |
| `wanted_clothing_id` (FK) | Garment they want |
| `status` | `active`, `withdrawn` (by the participant), `invalidated` (a referenced garment was withdrawn) |
| `created_at`, `updated_at` | Selection/change timestamps |

Example: “I want to offer my white pants for B's green jacket.” Offered clothing must belong to the participant; desired clothing must belong to another participant in the same event. Multiple intents are allowed.

An intent is **not final exchange consent**. Accepting an alternative changes the intent according to the participant's choice and recalculates proposals.

### 3.8 `trade_proposals` — Exchange Proposals

| Data | Description |
|---|---|
| `id` (PK) | Proposal identifier |
| `event_id` (FK) | Proposal's event |
| `version` | Version shown to participants |
| `status` | `pending`, `confirmed`, `rejected`, `invalidated`, `cancelled` |
| `end_reason` | Why it left `pending`/`confirmed`: `participant_rejected`, `intent_changed`, `clothing_changed`, `clothing_withdrawn`, `clothing_confirmed_elsewhere`, `event_closed`, `participant_cancelled`; null otherwise |
| `cycle_key` | Cycle identity: (participant, offered garment, received garment) entries sorted by participant |
| `created_at`, `confirmed_at`, `cancelled_at`, `ended_at` | Creation/confirmation/cancellation timestamps; `ended_at` is set whenever the proposal becomes rejected, invalidated, or cancelled, never on confirmation ([state transitions](api/README.md#proposal-state-transitions)) |

Store participants/garments in `trade_participants`. **One row represents one proposal version reviewed by participants.** Invalidate old versions when content changes and create new versions separately. Never apply old consent to new versions. Version links/history retention will be settled in detailed design.

Use a partial unique index on `(event_id, cycle_key)` only while pending, preventing duplicate pending cycles. Three-person cycles produce the same `cycle_key` regardless of starting participant.

### 3.9 `trade_participants` — Participation and Final Responses

| Data | Description |
|---|---|
| `id` (PK) | Participation identifier |
| `proposal_id` (FK) | Specific proposal version to review |
| `participant_id` (FK) | Exchange participant |
| `offered_clothing_id` (FK) | Garment given |
| `offered_content_version` | `clothes.content_version` of the offered garment when this proposal version was created |
| `received_clothing_id` (FK) | Garment received |
| `response` | Pending, consented, rejected |
| `responded_at` | Response timestamp |
| `is_confirmed` | Whether this row belongs to a **currently valid confirmed exchange**; default false |

Two-person exchanges have two rows, three-person exchanges three. One row per participant per version. Consent applies only to that `proposal_id`.

`is_confirmed` enables DB-enforced duplicate prevention. Set all proposal participation rows true on confirmation and false on cancellation, in the **same transaction** as proposal state changes. A partial unique index makes `offered_clothing_id` unique among true rows. Received clothing is offered by another participant in the same proposal, so constraining offered clothing suffices. Confirmed records stay true after event closure.

## 4. Relationships

```text
events
  ├─ participants
  │    ├─ photos
  │    ├─ clothes ─ photo, clothing_analyses
  │    ├─ preferences
  │    └─ exchange_intents ─ offered / desired clothing
  └─ trade_proposals
       └─ trade_participants ─ participant / offered / received clothing
```

`events.organizer_participant_id` references a participant in that event.

All participants/garments in intents/proposals must belong to **the same event**. Offered clothing belongs to its participant; received clothing is offered by another participant in the same proposal. Each proposal is a closed cycle of two or three distinct participants, each giving/receiving one garment.

## 5. AI Recommendation Data Flow

1. Save registered photos/descriptions in `clothes`.
2. Save AI-estimated features/checks in `clothing_analyses`.
3. Save original preferences/exclusions and reviewable interpretations in `preferences`.
4. Query available same-event clothing and send features/preferences to AI.
5. AI compares natural-language preferences and features, returning candidates/reasons/checks. Before displaying, server rechecks event membership/availability.
6. Save `exchange_intents` only when participants select desired and owned offered garments.

DB queries prepare candidates; AI compares their features to preferences. Compare simple DB filtering with AI comparison to validate value. AI output alone never saves exchange intents/final consent.

After photos/descriptions/preferences or availability change, check analysis/recommendation freshness. Invalidate/recompute cached recommendations after related changes. Offer manual browsing on AI failure.

## 6. Alternative Garment Suggestions

The first version can compare `exchange_intents` and `clothes` to detect **two-/three-person exchanges enabled by offering another owned garment**. A separate table is optional.

Before acceptance and final confirmation, recheck event state, ownership/availability, related intents, and proposal state. Never change intents without acceptance; acceptance is not final consent.

Consider adding `alternative_suggestions` later if acceptance/rejection history or suppressing repeated suggestions is needed.

## 7. Integrity and Concurrency

- **Duplicate garment confirmation:** no garment in two simultaneous confirmed exchanges. Do not restrict participants from multiple exchanges. Unconfirmed overlaps and reuse after cancellation are allowed, so unconditional garment uniqueness is unsuitable. Use a partial unique index on offered clothing where `trade_participants.is_confirmed` is true, plus conditional `clothes.status` updates from available to confirmed.
- **Final confirmation:** check active event, unanimous same-version consent, valid intents/clothing, ownership, and availability; update in one transaction. Serialize concurrent requests to prevent duplicates.
- **Proposal changes:** clothing/intent edits, withdrawal, or another confirmation invalidate affected unconfirmed proposals/consents. Review new proposals as new versions.
- **Recalculation:** find only affected cycles in the **same transaction** as intent registration/withdrawal/change, clothing edit/withdrawal, alternative acceptance, or exchange cancellation. Reuse existing pending `cycle_key` proposals rather than duplicating.
- **Re-proposal suppression:** do not recreate a cycle whose latest proposal for the same `cycle_key` was `rejected` or `cancelled` unless, after that proposal's `ended_at`, one of its intents was created or updated, or one of its garments has a `content_version` different from `trade_participants.offered_content_version`.
- **Duplicate requests:** consent/rejection/cancellation/closure/intent registration produce the same result when repeated, per API idempotency rules.
- **Alternative acceptance:** suggestions are not stored. In one transaction, check current/new garment ownership/availability and recalculate whether the changed intent closes a cycle now. Failure leaves intents unchanged.
- **AI persistence:** call AI outside transactions. On save, compare clothing `content_version`/preference `version` with request-time values. Mismatches must not become current results.
- **History:** detailed design must decide how to preserve clothing information/conditions reviewed at confirmation. Referencing mutable descriptions alone may alter apparent past exchange contents.
- **Cancellation:** before closure, cancellation by a party cancels the entire exchange and restores availability of garments not yet handed over together.
- **Closure:** server/DB ordering prevents new confirmation after closure even with simultaneous final consent.
- **Physical handover:** confirmation is separate from completed handover. Cancellation after partial handover and completion records remain undecided.

## 8. Future Tables and Open Decisions

| Item | When needed |
|---|---|
| `clothing_photos` | Multiple photos and per-garment ordering |
| `alternative_suggestions` | Suggestion history and acceptance/rejection state |
| Recommendation results | Revisiting or analyzing recommendation history |
| Session recovery tables | After participant/organizer session recovery is decided |
| Handover records | After deciding who records completion and how |

Decide photo/event retention/deletion, participant/garment limits, proposal history retention, and post-closure access separately. Never infer participant/organizer authorization from entry/QR codes alone.
