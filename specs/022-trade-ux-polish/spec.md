# Feature Specification: 020 Follow-up — Trade UX Polish

**Feature Branch**: `fix/frontend-trade-ux-polish` (stacked on `feature/020-exchange-requests`)

**Created**: 2026-11-04

**Status**: Draft

**Input**: "1. Sender must not receive mirrored reverse intents in Received; only the receiver sees the request. Receiver accept → sender's sent request reads Accepted; receiver decline → sender sees declined. 2. Received rows show the main garment photo at left, with Accept/Decline inside the same box. 3. Received/Sent/Exchanges all show main garment photos."

## Decisions (product, 2026-11-04)

- D1: The auto-created reverse intent (accept side-effect) is hidden from the original sender's Received list and badge. Rule: hide received intent R when the caller holds a sent intent S with same swapped pair (S.offered == R.wanted, S.wanted == R.offered) and S.acceptedProposalId != null. Genuine counter-requests (both sides independently active, neither accepted) still show.
- D2: Backend unchanged (no API doc change): the reverse intent still exists and remains acceptable via API; only frontend presentation filters it. Filtering is shared between the Received list and the badge count.
- D3: Photos: Received rows show the offered garment's main photo (the incoming offer) at left; Sent rows show the offered garment's photo; Exchanges rows show offered + received photos. Photo unavailable → existing "Photo unavailable" fallback pattern.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No mirror noise for the sender (Priority: P1)

I send a request; my Sent tab shows Waiting → Accepted/Declined. I never see a mirrored request in my Received for a pair I already accepted.

**Independent Test**: Seed sent intent S (accepted) + mirror reverse R; assert received list and badge exclude R; assert independent counter-requests (no acceptedProposalId) still appear.

**Acceptance Scenarios**:

1. **Given** my sent request was accepted, **When** I open Received, **Then** the mirrored reverse intent is hidden.
2. **Given** the mirror is hidden, **When** I check the Trades badge, **Then** it is not counted.
3. **Given** the other person independently requested my item (no acceptance on either side), **When** I open Received, **Then** it still appears with Accept/Decline.

---

### User Story 2 - Photo-led request rows with in-box actions (Priority: P2)

Each Received row shows the offered garment's main photo at left; Accept/Decline sit inside the same box so ownership is unambiguous. Same for Sent (offered photo) and Exchanges (offered + received photos).

**Independent Test**: Manual 360–430px check + /impeccable critique of T1 segments.

**Acceptance Scenarios**:

1. **Given** a received request, **When** it renders, **Then** the offered garment photo is at left and both buttons are inside the same container.
2. **Given** a photo fails to load, **When** it renders, **Then** the existing fallback text appears, layout intact.
3. **Given** an exchange row, **When** it renders, **Then** both garments' photos (or fallbacks) are visible.

---

### Edge Cases

- Mirror rule keys on acceptedProposalId of the sent twin; confirmed pairs keep Sent "Accepted" label (no status change).
- Photo URL empty string (backend placeholder) → treat as unavailable, show fallback.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-01**: Frontend MUST hide a received intent that mirrors an accepted sent intent (swapped pair + sent.acceptedProposalId != null) from the Received list and the Trades badge.
- **FR-02**: Received rows MUST render the offered garment's main photo at left with Accept/Decline controls inside the same row container.
- **FR-03**: Sent rows MUST render the offered garment's photo; Exchanges rows MUST render offered and received garment photos (with fallbacks).
- **FR-04**: No backend/API contract change; no test deletions (update only tests asserting superseded behavior).

### Key Entities

- **Mirror pair**: sent intent S and received intent R with swapped offered/wanted garment IDs where S.acceptedProposalId != null.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: Sender flow shows Waiting → Accepted/Declined in Sent only; mirrored reverse never appears in Received or badge.
- **SC-02**: On mobile, every row in Received/Sent/Exchanges shows garment photo(s); each Received row's buttons are visually inside its own container.
- **SC-03**: `pnpm lint`, `typecheck`, `test`, and `build` pass; /impeccable critique applied.

## Assumptions

- Backend 020 (intents/proposals/consent/retrofits) merged or merged together via stacked PR base `feature/020-exchange-requests`.
