# Feature Specification: Trades Status Fixes After Exchange QA

**Feature Branch**: `royal-seal`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Exchange request/proposal UX and state fixes after QA of 021/022: (1) hide Accept/Decline on received requests once Accepted; (2) faster status refresh of Sent requests when counterpart accepts/declines (QA saw Waiting until manual reload); (3) Exchanges tab shows request-stage progress (pending requests distinct from real proposals) instead of 'No exchanges yet'; (4) proposals where the current user has consented but others have not stay in progress ('Waiting for others') not History; (5) proposals ended due to a declined request show a human-readable reason like 'Declined' instead of internal invalidated/intent_changed; (6) verify requests remaining active after a 3-way confirmation is intended, and ensure confirmed garments don't expose request lists/buttons or allow reprocessing — fix state or display if wrong; (7) exception scenarios to verify: 1:1 confirmation after both consent, 3-way decline/withdraw, multiple proposals sharing a garment where one confirms, near-simultaneous consent/cancel, cancel confirmed exchange and actions after event close."

## Context

QA of the exchange request (021) and cancel/handover (022) features found that Trades shows stale or misleading state. The server rules are correct; most issues are in how Trades presents them. One finding was checked against the decisions on record:

- **Requests stay `active` after their garments are confirmed elsewhere.** This is intended: "when a garment is confirmed elsewhere, only pending proposals are invalidated; other active requests stay active" (decided 2026-11-03, `docs/plans/api/09-intents.md`). The server already refuses to accept such a request (`CLOTHING_ALREADY_CONFIRMED`) or to form new proposals with a confirmed garment. This feature keeps the data model and fixes what Trades shows for those requests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Received requests show only the actions that still apply (Priority: P1)

As the owner of a requested garment, once I accept a request I should not see Accept and Decline again for it, and requests that can no longer be acted on (because either garment is already confirmed in an exchange) must not offer actions.

**Why this priority**: Leftover buttons invite double processing and confuse users about whether their action worked.

**Independent Test**: Accept a received request and verify the row shows "Accepted" with no Accept/Decline; confirm an exchange that uses one of the garments in another request and verify that request shows no actions.

**Acceptance Scenarios**:

1. **Given** a received request I have not answered, **When** I view Received, **Then** I see Accept and Decline.
2. **Given** I accepted a received request, **When** the accept completes, **Then** the row shows "Accepted" and Accept/Decline disappear without reloading.
6. **Given** I accepted a request whose resulting proposal later ended (rejected, invalidated, or cancelled) while the request is still active and both garments are available, **Then** Accept and Decline are offered again (the server allows re-acceptance).
3. **Given** a received request whose offered or wanted garment is confirmed in an exchange, **When** I view Received, **Then** the row shows a status explaining the garment is already in a confirmed exchange and shows no Accept/Decline.
4. **Given** a sent request whose offered or wanted garment is confirmed in an exchange, **When** I view Sent, **Then** the row shows the same explanation; Withdraw stays available while the request is active (withdrawing never affects a confirmed exchange).
5. **Given** the event is closed, **When** I view Received or Sent, **Then** no actions are shown.

---

### User Story 2 - Status changes by the other party appear promptly (Priority: P1)

As a requester, when the owner accepts or declines my request, Sent and Exchanges should reflect that change quickly without me reloading the page.

**Why this priority**: On site, participants act within seconds of each other; a stale "Waiting" makes them think nothing happened.

**Independent Test**: With two browsers, accept a request as the owner and measure how long the requester's Sent row takes to change from "Waiting" to "Accepted" with no manual reload.

**Acceptance Scenarios**:

1. **Given** I am on Trades with the event active and the page visible, **When** the other party accepts or declines my request, **Then** my Sent row shows the new status within 5 seconds.
2. **Given** I return to the Trades page (tab focus or navigation), **When** it becomes visible, **Then** it refreshes immediately.
3. **Given** the event is closed or the page is hidden, **Then** automatic refresh stops.

---

### User Story 3 - Exchanges shows every trade in progress, including the request stage (Priority: P1)

As a participant, right after sending or receiving a request, Exchanges should show that trade in progress instead of "No exchanges yet". Request-stage items are visually distinct from proposals, and proposals I already consented to stay in progress until everyone has answered.

**Why this priority**: Exchanges is the overview of "where are my trades"; an empty screen after sending a request reads as failure.

**Independent Test**: Send a request and open Exchanges as both parties; consent to a 1:1 or 3-person proposal while another participant has not and verify it stays under an in-progress group.

**Acceptance Scenarios**:

1. **Given** I sent a request that has not been answered, **When** I open Exchanges, **Then** I see it in a "Requests" group labeled as waiting for the owner, distinct from proposals, linking to Sent.
2. **Given** I received a request I have not answered, **When** I open Exchanges, **Then** I see it in the "Requests" group labeled as waiting for my answer, linking to Received.
3. **Given** a pending proposal I consented to while at least one other participant has not (any cycle size), **When** I open Exchanges, **Then** it appears under "Waiting for others" with who is still pending, not under History.
4. **Given** a pending proposal awaiting my consent, **Then** it appears under "Awaiting my consent".
5. **Given** no requests and no proposals, **Then** the empty state is shown as today.
6. **Given** a request that is a leg of a live (pending or confirmed) proposal — including reverse requests created by accepting and legs of 3-person cycles — **Then** it is shown only through that proposal, not in "Requests".

---

### User Story 4 - Ended exchanges explain why in plain words (Priority: P2)

As a participant, when an exchange ends without confirmation, History should tell me why in plain words (for example "Declined") instead of internal states such as "invalidated".

**Why this priority**: Understanding why a trade ended lets users decide what to do next; the trade itself already ends correctly.

**Independent Test**: Create proposals that end through each end reason and verify History shows the plain-language label for each.

**Acceptance Scenarios**:

1. **Given** a proposal ended because a request in it was declined, **When** I view History, **Then** it is labeled "Declined".
2. **Given** a proposal ended because a request in it was withdrawn, **Then** it is labeled "Request withdrawn".
3. **Given** a proposal ended because a participant rejected it, **Then** it is labeled "Rejected".
4. **Given** a proposal ended because a garment was confirmed in another exchange, **Then** it is labeled "Item exchanged elsewhere".
5. **Given** a proposal ended because a garment changed or was withdrawn, or because the event closed, **Then** it is labeled with a matching plain phrase ("Item changed", "Item withdrawn", "Event closed").
6. **Given** a confirmed exchange that was cancelled, **Then** it is labeled "Cancelled".
7. Internal state names (`invalidated`, `intent_changed`, and other raw end reasons) never appear in Trades.

---

### User Story 5 - Exception paths behave correctly end to end (Priority: P2)

As the team, we need evidence that the exchange rules hold on the paths QA has not yet covered.

**Why this priority**: These are rule-critical (no double confirmation, no stale consent, closure stops actions) but already enforced by the server; this story verifies and fixes any gap found.

**Independent Test**: Each scenario below is run against the real app and its stored data.

**Acceptance Scenarios**:

1. **Given** a 1:1 request accepted by the owner, **When** the requester consents, **Then** the exchange is confirmed for both and both garments are confirmed.
2. **Given** a pending 3-person proposal, **When** one participant rejects it, or a request in its cycle is declined or withdrawn, **Then** the proposal ends for all three, earlier consents are not reused, and History shows the plain reason.
3. **Given** several pending proposals sharing a garment, **When** one is confirmed, **Then** every other pending proposal containing that garment ends as "Item exchanged elsewhere", and their remaining requests offer no actions that would fail.
4. **Given** participants consent or cancel nearly simultaneously, **Then** a garment is confirmed in at most one exchange, the final state is consistent for every participant, and losers of a race get a clear message rather than a silent failure.
5. **Given** a confirmed exchange cancelled before closure, **Then** it shows "Cancelled" for all parties and its garments are available again; **given** the event is closed, **then** every new transition (new request, accept, decline, withdraw, consent, reject, cancel) is refused with the closed-event error while idempotent replays of already-completed actions return the current state unchanged, and Trades is read-only.

### Edge Cases

- A request accepted into a proposal that later ends (for example the requester did not consent before another exchange confirmed the garment): the request row reflects the garment state, not a stale "Accepted" with actions.
- A received request whose wanted garment was withdrawn: shown as ended (existing "Invalidated" status is replaced by a plain phrase such as "Item withdrawn").
- Accept or Decline returns a conflict because the state changed meanwhile: the row shows the server message and refreshes to the current state.
- The same request appears in Sent/Received and in Exchanges' "Requests" group: both views show the same status.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Received requests MUST show Accept and Decline only while the request is active, is not a leg of a live (pending or confirmed) proposal, both garments are still available, and the event is active. Hiding Decline for requests with a confirmed garment is a deliberate UI restriction (the server would allow it).
- **FR-002**: Sent requests MUST show Withdraw while the request is active and the event is active.
- **FR-003**: Request rows MUST show a plain status: "Waiting", "Accepted", "Declined", "Withdrawn", "Item withdrawn" (request ended because a garment was withdrawn), or "Item already exchanged" (a garment in it is confirmed in an exchange).
- **FR-004**: While the event is active and Trades is visible, request and proposal lists MUST refresh often enough that a change by another participant appears within 5 seconds (poll interval leaves headroom for request and render time); refresh MUST also run when the page regains focus, and MUST stop when the event is closed or the page is hidden.
- **FR-005**: After the user's own Accept, Decline, Withdraw, consent, reject, or cancel succeeds, Trades MUST show the new state without a manual reload.
- **FR-006**: Exchanges MUST include a "Requests" group listing active requests the user sent or received whose garments are both available and that are not a leg of a live (pending or confirmed) proposal, each labeled with who must act next, visually distinct from proposals, and linking to the matching Sent or Received list.
- **FR-007**: Exchanges MUST group pending proposals into "Awaiting my consent" (my response pending) and "Waiting for others" (I consented, someone else has not), for every cycle size, and MUST show which participants are still pending.
- **FR-008**: History MUST contain proposals that are rejected, invalidated, or cancelled (and any unrecognized ended status); never pending or confirmed ones.
- **FR-009**: History entries and the proposal detail screen MUST show a plain-language end reason; a proposal ended by a declined request MUST read "Declined" and one ended by a withdrawn request MUST read "Request withdrawn". Raw internal state and end-reason names MUST NOT be displayed anywhere, including the version-conflict dialog.
- **FR-010**: Proposal status labels in Trades MUST be plain words ("Waiting for consent", "Confirmed", "Rejected", "Cancelled", or the end-reason label for invalidated proposals).
- **FR-011**: The server-side data model for requests after confirmation stays as decided (requests remain active); no request is changed without the participant's action.
- **FR-012**: The exception scenarios in User Story 5 MUST be verified against the running app and stored data; any rule violation found MUST be fixed with a reproducing test.

### Key Entities

- **Exchange request (intent)**: status (active, declined, withdrawn, invalidated), whether it was accepted, and the availability of its offered and wanted garments.
- **Exchange proposal**: status, end reason, cycle size, each participant's response, and whether the current user is a participant.
- **Request outcome for display**: derived from the above; distinguishes "declined" from "withdrawn" for proposals that ended because a request changed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a two-browser test, a counterpart's accept or decline appears on the requester's Trades within 5 seconds in 10 of 10 trials, with no manual reload.
- **SC-002**: After accepting a request, 0 Accept/Decline buttons remain on that request in Received.
- **SC-003**: Right after sending a request, both the requester and the owner see the trade in Exchanges (0 cases of "No exchanges yet" while an eligible active request — both garments available — or a live proposal exists).
- **SC-004**: 0 pending proposals appear under History in any test.
- **SC-005**: 0 raw internal state names (`invalidated`, `intent_changed`, etc.) are visible anywhere in Trades.
- **SC-006**: All five exception scenarios in User Story 5 pass in a QA run that checks both the screens and stored data, with 0 cases of a garment confirmed in more than one exchange.

## Assumptions

- Refresh keeps using periodic polling while the page is visible; push delivery is out of scope.
- Telling "declined" from "withdrawn" for proposals ended by a request change may require the server to expose which request outcome ended the proposal; the stored end reason (`intent_changed`) itself is not renamed.
- "Requests" in Exchanges is a summary that links to Sent/Received; actions stay in Sent/Received.
- Withdraw of an accepted request whose proposal is still pending stays allowed (it invalidates the proposal per existing rules).
- Withdrawing consent before confirmation remains unsupported (existing open item).
