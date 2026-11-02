# Vintage Relay Draft Mobile Screen Flow

## 1. Purpose and Scope

List required mobile screens, connections, and primary button destinations. This **initial proposal** is based on [PROJECT.md](../../PROJECT.md), [vintage-relay-plan-v1.md](../plans/vintage-relay-plan-v1.md), and [database-design-v1.md](../plans/database-design-v1.md). It excludes visual design/API details. Revised by the [2026-11-02 app flow redesign](../superpowers/specs/2026-11-02-app-flow-redesign-design.md): four tabs, AI search, and visible exchange requests. Mockup: [v2](mockup-flow-v2.html) (current); the [v1 interactive mockup](mockup-flow-v1.html) predates that redesign.

## 2. Assumptions

- Creating an event automatically registers the organizer as a participant, referenced by `events.organizer_participant_id`.
- No separate organizer app. **Add organizer-only features to one participant app**, shown when `participant.id == event.organizer_participant_id`.
- Organizers register garments and exchange through the same screens as other participants.

## 3. Overall Structure

```text
[S0 Landing] ─┬─ Your events (sessions saved on this device) → [P2 Home]
              ├─ Create event → [H1 Create] → [H2 Created/share] → [P2 Home]
              └─ Code/QR → [P1 Join] → [P2 Home]

Bottom tabs: Home (P2) | Search (S1) | Trades (T1) | My items (C1)
Organizer only: header menu → [M1 Manage event]
```

Removed from the earlier draft: B1 AI recommendations, B2 (merged into Home), R1/R2 preferences, C3 AI analysis review. A1 alternative garment is deferred.

## 4. Screens

### 4.1 Entry and Organizer Features

| ID | Screen | Main elements and navigation |
|---|---|---|
| S0 | Landing | "Your events" list first when this device holds event sessions (name and active/closed state; tap → P2). Then [Create event] → H1, [Join with code or QR] → P1 |
| H1 | Create event | Event name and organizer display name. [Create] → create event/participant together → H2 |
| H2 | Created/share | QR, entry code, [Copy link]. [Register my clothes] → C2, [Home] → P2. Shown once after creation |
| M1 | Manage event | Organizer only, from the header menu. QR/code, participant/garment/confirmed exchange counts, [Close event] → H3 |
| H3 | Closure confirmation modal | Explain cancellation of all unconfirmed proposals, including organizer's (proposed closure handling). [Close] → M1 closed state |
| P1 | Join | QR prefills code. Show event name; enter display name. [Join] → P2 |

### 4.2 Home and Search Tabs

| ID | Screen | Main elements and navigation |
|---|---|---|
| P2 | Home | Other participants' `available` garments only, newest first, 2 per row: 3:4 main photo with the title below. Card → B3. Empty state invites registering items |
| B3 | Another participant's item | Photo carousel, category, title, measurements, description; AI colors/features labelled as AI estimates. [Request exchange] → I1; an existing request shows its state and [Withdraw request] |
| I1 | Offer sheet | Select one available owned garment to offer; [Send request] → B3. No clothing → [Register item] → C2 |
| S1 | Search | Natural-language input → AI interpretation → removable chips (category, colors, measurement ranges) and a "Not understood" note. Results in the Home grid, best matches first ([ranking](../plans/api/15-search.md)); card → B3. [Edit filters] → S2. AI failure → error and [Choose filters] → S2 |
| S2 | Filters sheet | Category (Top/Outer/Bottom/Other), colors (fixed list), measurement ranges for the chosen category. [Apply] → S1 results |

### 4.3 My Items Tab

| ID | Screen | Main elements and navigation |
|---|---|---|
| C1 | My items | [+ Register item] → C2. Rows: main photo, title, status badge (available/confirmed/withdrawn), "AI analyzing…" while analysis runs (planned in 018), received request count. Row → C4 |
| C2 | Register/edit clothing | Two steps. Step 1: 1–10 camera/album photos in a swipeable 3:4 carousel (arrows on precise pointers, tap for full photo), [Next] when all are uploaded. Step 2: Title, Description, Category (Top/Outer/Bottom/Other), optional measurements in inches for the category; [Back] keeps both steps. [Register] → C1 with "Clothing registered." (014 currently returns to P2 until C1 exists). Edit reuses the same form prefilled and returns to C4. Warn that edits invalidate affected unconfirmed proposals. From 018 (planned), the backend starts AI analysis after each save |
| C4 | My item detail | Item information and AI estimates, **requests received for this item** with [Accept]/[Decline], related exchanges (→ T2/T3). [Edit] → C2, [Delete] → confirmation. Confirmed garments cannot be edited/deleted; guide to cancellation → T3 |

### 4.4 Trades Tab

| ID | Screen | Main elements and navigation |
|---|---|---|
| T1 | Trades | Segments: **Received** (requests for my items: [Accept] → T2, [Decline]) / **Sent** (my requests: waiting, accepted → T2, declined; [Withdraw request]) / **Exchanges** (awaiting my consent → T2, 3-person exchange found → T2, confirmed → T3, history of invalidated/rejected/cancelled) |
| T2 | Pending proposal | Cycle diagram, offered/received clothing per participant, responses, version. [Consent]/[Reject] with confirmation. Read-only if invalidated; unanimous consent → T3. After [Accept], the accepter's consent is already recorded |
| T3 | Confirmed/handover | Who gives/receives what; explain confirmation is not completed handover. [Cancel exchange] → confirmation → T1 |

## 5. Core Flows

1. **Organizer:** S0 → H1 → H2 (share QR) → C2 → C1.
2. **New participant:** QR → P1 → P2 → C2 (register) → P2 or S1 (search) → B3 → I1 (send request).
3. **Two-person exchange:** owner opens T1 Received or C4 → [Accept] → proposal with the owner's consent → requester sees it under Sent/Exchanges → T2 → [Consent] → T3.
4. **Three-person exchange:** server finds a cycle from active requests → T1 Exchanges "3-person exchange found" → T2 → [Consent] by all three → T3.
5. **On-site handover:** T1 Exchanges → T3; inspect garments, [Cancel exchange] if needed.
6. **AI failure:** S1 error → S2 manual filters. A failed analysis only hides AI estimates on B3/C4 and color matches in search.
7. **Closure:** header menu → M1 → H3 → closed.

## 6. Global States

- **Closed event:** show a banner everywhere; all tabs stay readable; disable registration, edit, delete, requests, accept/decline, consent, and cancellation. T3 remains view-only.
- **Version conflict:** if consent or accept is rejected, show a proposal-changed modal and reload current state.
- **Notifications:** no live chat; propose a badge on the Trades tab and periodic refresh.
- **Organizer badge:** propose labeling organizers in proposals/clothing details.

## 7. Open Decisions

- **Session recovery:** settle returning-user verification before finalizing P1/organizer permission persistence. Losing the organizer session loses closure access; meanwhile propose a same-device notice on H2.
- **Handover completion:** decide whether T3 needs [Handover complete].
- **Proposal ordering:** define T1 Exchanges sorting when multiple proposals exist.
- **Creation transaction:** events/participants reference each other. Create both and save `organizer_participant_id` in one transaction. Propose returning event information and organizer participant session together.
