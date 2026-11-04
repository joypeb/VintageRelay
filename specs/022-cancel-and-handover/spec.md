# Feature Specification: 021 Cancel and Confirmed Handover View

**Feature Branch**: `feature/021-cancel-and-handover`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "021 Cancel and confirmed handover view (backend + frontend). Backend: POST /api/v1/proposals/{proposal_id}/cancel per docs/plans/api/13-cancel-exchange.md: only parties, only confirmed proposals, cancels the entire exchange, makes its garments available again, recalculates proposals in the same transaction, idempotent replay, EVENT_CLOSED after closure. Frontend: confirmed view (T3) showing who gives and receives each garment, links to garment details for inspection, the note that confirmation is not handover, and Cancel exchange with confirmation while the event is active; confirmed and history entries in Trades; confirmed items on My item detail link to T3."

> Roadmap ID is 021; the spec directory is `022-cancel-and-handover` because `specs/021-*` was taken by the 020 exchange requests spec.

## Clarifications

### Session 2026-11-04

- Q: Should the confirmed view offer a [Handover complete] record? → A: No. Handover stays untracked in v1 (open decision); the view only shows the inspection notice.
- Q: Should the confirmed view refresh on its own? → A: Yes, about every 10 seconds while the event is active (design critique: a party standing at the table must not see a stale "Confirmed" after the other party cancelled).
- Q: What does the cancel confirmation say, and do other parties get a visible notice? → A: Dialog title "Cancel this exchange?", body "The whole exchange is cancelled for every participant, and all its garments become available again.", actions [Cancel exchange] / [Keep exchange]. Other parties get no new notice: the exchange moves to History on their next Trades refresh; the existing Trades badge (actionable items only) is unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cancel a confirmed exchange (Priority: P1)

A party to a confirmed exchange changes their mind on site (for example, the garment does not fit on inspection). Before the event closes, they cancel the whole exchange. Every garment in it becomes available again for everyone, and new exchanges can form with those garments.

**Why this priority**: Confirmation is not handover; without a way to undo it, a bad match on site locks garments for the rest of the event.

**Independent Test**: Confirm a two-person exchange, cancel it as one party, and assert the exchange is cancelled for both, both garments are available, and a new request using one of them can form a new proposal.

**Acceptance Scenarios**:

1. **Given** a confirmed exchange I am part of and an active event, **When** I cancel it, **Then** the exchange becomes cancelled for every participant with the reason "a participant cancelled", and all its garments become available again.
2. **Given** I already cancelled (or another party cancelled) the exchange, **When** I cancel again, **Then** I get the same cancelled exchange back without changes, even after the event closed.
3. **Given** the event is closed and the exchange is still confirmed, **When** I try to cancel, **Then** I am refused with "This event is closed, so exchanges can no longer be cancelled." and the exchange stays confirmed.
4. **Given** an exchange that is pending, rejected, or invalidated, **When** I try to cancel it, **Then** I am refused because it is not confirmed.
5. **Given** an exchange I am not part of, **When** I try to cancel it, **Then** I am told it does not exist.
6. **Given** a cancelled exchange whose requests are all still active, **When** proposals are recalculated, **Then** the same cycle is not proposed again until one of its requests or garments changes, but other cycles using the freed garments may form.

---

### User Story 2 - Confirmed handover view (T3) (Priority: P1)

After confirmation, participants meet on site. The confirmed view shows, for each participant, who gives which garment to whom, the people to meet by display name, the caller's own pair highlighted, a link to each garment's detail (all photos and measurements) for inspection, and the notice "Confirmed. Inspect the garments in person before handing them over." While the event is active, a [Cancel exchange] action asks for confirmation, explaining that the whole exchange is cancelled for every participant, and then returns to Trades.

**Why this priority**: Participants need a single screen to carry out the on-site handover and to reach cancellation.

**Independent Test**: Open a confirmed exchange as a party and verify pairs, names, garment links, the notice, and that [Cancel exchange] appears only while the event is active and requires a confirmation step.

**Acceptance Scenarios**:

1. **Given** a confirmed exchange I am part of, **When** I open it, **Then** I see each participant's given and received garment, their display names, my own pair highlighted, the confirmation time, and the notice that confirmation is not handover.
2. **Given** I tap a garment in the confirmed view, **When** its detail opens, **Then** I can inspect all photos and measurements.
3. **Given** the event is active, **When** I tap [Cancel exchange] and confirm, **Then** the exchange is cancelled and I return to Trades where it appears under history.
4. **Given** I tap [Cancel exchange] and dismiss the confirmation, **Then** nothing changes.
5. **Given** the event is closed, **When** I open a confirmed exchange, **Then** it is view-only with no [Cancel exchange].
6. **Given** an exchange that was cancelled, **When** I open it, **Then** it is view-only and shows it was cancelled.

---

### User Story 3 - Confirmed and history entries in Trades and My item detail (Priority: P2)

The Exchanges segment in Trades lists confirmed exchanges (opening the confirmed view) and a history of rejected, invalidated, and cancelled exchanges. On My item detail, a confirmed garment links to its confirmed exchange and stays locked against edit and delete, with guidance to cancel from the confirmed view.

**Why this priority**: Navigation into the confirmed view; the exchange itself already works through direct links.

**Independent Test**: With one confirmed and one cancelled exchange, open Trades → Exchanges and verify both appear in the right group and open the right screen; open My item detail of the confirmed garment and verify the link and the lock.

**Acceptance Scenarios**:

1. **Given** I have a confirmed exchange, **When** I open Trades → Exchanges, **Then** it is listed as confirmed and opens the confirmed view.
2. **Given** I have a cancelled exchange, **When** I open Trades → Exchanges, **Then** it is listed in history as cancelled.
3. **Given** my garment is in a confirmed exchange, **When** I open its My item detail, **Then** I see a link to the confirmed view and edit/delete stay disabled with guidance to cancel the exchange first.
4. **Given** the exchange was cancelled, **When** another party opens Trades, **Then** the exchange shows under history as cancelled on their next refresh (no push notification).

### Edge Cases

- Two parties cancel at the same time: exactly one cancellation takes effect; the other gets the same cancelled exchange back.
- Cancellation races with event closure: the operations are serialized; if closure wins, cancellation fails with the closed-event error and the exchange stays confirmed.
- Cancellation races with final consent on another proposal sharing a freed garment: serialized; the garment can be confirmed in at most one exchange.
- A three-person exchange is cancelled: all three garments become available and all three participants see it as cancelled.
- A freed garment was withdrawn or edited by its owner before cancellation: not possible, because confirmed garments cannot be edited or withdrawn.
- The cancellation fails internally: the exchange stays confirmed and garments stay locked.
- A participant opens the confirmed view of an exchange that was cancelled by someone else since their last load: the screen shows the current cancelled state after reload, and a cancel attempt replays the cancelled exchange.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let only participants of an exchange cancel it; for anyone else the exchange MUST appear not to exist.
- **FR-002**: The system MUST allow cancellation only while the event is active and only for confirmed exchanges; pending, rejected, and invalidated exchanges MUST be refused with a "not confirmed" error.
- **FR-003**: Cancelling MUST cancel the entire exchange for all participants, record the cancellation time and end time, set the end reason to "participant cancelled", and clear every participant's confirmation flag.
- **FR-004**: Cancelling MUST make every garment in the exchange available again (all garments are treated as not handed over in v1).
- **FR-005**: Cancelling MUST recalculate proposals for the freed garments in the same atomic operation; the cancelled cycle itself MUST stay suppressed until one of its requests or garments changes.
- **FR-006**: Repeating a cancel on an already cancelled exchange MUST return the cancelled exchange unchanged with success, including after closure.
- **FR-007**: Cancelling after the event closed MUST fail with the closed-event error and leave the exchange confirmed.
- **FR-008**: Cancellation MUST be serialized with event closure and final consent so a garment is never confirmed in two exchanges and no cancellation lands after closure.
- **FR-009**: If cancellation fails, the exchange MUST stay confirmed and its garments locked.
- **FR-010**: The system MUST log each cancellation with the exchange and the cancelling participant.
- **FR-011**: The confirmed view MUST show each participant's display name and given and received garment (title, category, main photo), highlight the caller's pair, show the confirmation time, link each garment to its full detail, and show "Confirmed. Inspect the garments in person before handing them over." whenever the exchange is confirmed.
- **FR-012**: The confirmed view MUST show [Cancel exchange] only when the exchange can be cancelled, and MUST ask for confirmation before cancelling with the title "Cancel this exchange?", the body "The whole exchange is cancelled for every participant, and all its garments become available again.", and the actions [Cancel exchange] / [Keep exchange].
- **FR-013**: After a successful cancellation the app MUST return to Trades; the exchange MUST appear under history.
- **FR-014**: Trades → Exchanges MUST list confirmed exchanges (opening the confirmed view) and history entries for rejected, invalidated, and cancelled exchanges.
- **FR-015**: My item detail MUST link a confirmed garment to its confirmed exchange and keep edit and delete disabled with guidance to cancel first.
- **FR-016**: When the event is closed, the confirmed view MUST be view-only.
- **FR-017**: While the event is active, the confirmed view MUST refresh periodically (about every 10 seconds) so a party at the table sees a cancellation by someone else; cancelled and closed views do not poll. The Trades list keeps its existing 020 refresh cadence because it also carries pending items.
- **FR-018**: The confirmed view MUST NOT offer a handover completion record (open decision; out of scope).

### Key Entities

- **Exchange (proposal)**: A two- or three-person cycle; states pending, confirmed, rejected, invalidated, cancelled; holds confirmation time, cancellation time, end time, end reason, and whether the caller can cancel.
- **Exchange participant**: A participant in an exchange with the garment they give and the garment they receive, and a confirmation flag.
- **Garment**: Clothing with an availability state; confirmed garments are locked, cancelled exchanges return them to available.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a party cancels a confirmed exchange, 100% of its garments are available again and a new request using one of them can form a new proposal in the same session.
- **SC-002**: Repeating a cancel returns the same cancelled exchange in 100% of attempts with no further state change.
- **SC-003**: 0 cancellations succeed after the event closes.
- **SC-004**: A participant reaches the confirmed view of their exchange from Trades or My item detail in at most 2 taps.
- **SC-005**: The end-to-end phone run create → join → register → search → request → accept → consent → cancel → close completes without errors.

## Assumptions

- Cancellation reason is not collected (open decision in API 13).
- v1 records no handover state and restores all garments of the cancelled exchange per API 13; the cancellation policy after partial physical handover remains undecided.
- No new read endpoint: the confirmed view and lists reuse the existing proposal reads from 020, which already expose `canCancel`, `cancelledAt`, and `endedAt`.
- Other parties learn of a cancellation only through the Trades refresh (History entry); there is no push notification and the Trades badge logic is unchanged.
- Confirmed records stay viewable after closure (proposed in the initial plan).
- Existing 020 rules for cycle suppression, proposal generation, and serialized confirmation are reused.
