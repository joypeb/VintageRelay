# Vintage Relay Draft Mobile Screen Flow

## 1. Purpose and Scope

List required mobile screens, connections, and primary button destinations. This **initial proposal** is based on [PROJECT.md](../../PROJECT.md), [vintage-relay-plan-v1.md](../plans/vintage-relay-plan-v1.md), and [database-design-v1.md](../plans/database-design-v1.md). It excludes visual design/API details. See the [interactive mockup](mockup-flow-v1.html).

## 2. Assumptions

- Creating an event automatically registers the organizer as a participant, referenced by `events.organizer_participant_id`.
- No separate organizer app. **Add organizer-only features to one participant app**, shown when `participant.id == event.organizer_participant_id`.
- Organizers register garments and exchange through the same screens as other participants.

## 3. Overall Structure

```text
[S0 Landing] ─┬─ Create event → [H1 Create] → [H2 Created/share] → [P2 Home]
              └─ Code/QR → [P1 Join] → [P2 Home]

Bottom tabs: Home (P2) | Browse (B1) | My clothes (C1) | Exchanges (T1)
Organizer only: Home "Manage event" card, header menu → [M1 Manage event]
```

## 4. Screens

### 4.1 Entry and Organizer Features

| ID | Screen | Main elements and navigation |
|---|---|---|
| S0 | Landing | [Create event] → H1, [Join with entry code] → P1 |
| H1 | Create event | Event name and organizer display name. [Create] → create event/participant together → H2 |
| H2 | Created/share | QR, entry code, [Copy link]. [Register my clothes] → C2, [Home] → P2. Shown once after creation |
| M1 | Manage event | Organizer only. QR/code, participant/garment/confirmed exchange counts, [Close event] → H3 |
| H3 | Closure confirmation modal | Explain cancellation of all unconfirmed proposals, including organizer's. [Close] → M1 closed state |
| P1 | Join | QR prefills code. Show event name; enter display name. [Join] → P2 |
| P2 | Home | Event banner. Organizer gets manage card (→ M1). Tasks: pending consent → T2, alternative → A1, register clothes → C2, preferences → R1, recommendations → B1 |

### 4.2 Browse Tab

| ID | Screen | Main elements and navigation |
|---|---|---|
| B1 | AI recommendations | "My preferences" chip → R1. Reasons/checks per card; card → B3. Missing preferences → R1, AI failure → B2 |
| B2 | All clothing | Segment switch with B1. Cards → B3 |
| B3 | Another participant's clothing | Photo, owner description, AI features labeled estimates, uncertainties. [I want this] → I1; existing intent shows [Withdraw intent] |
| I1 | Offered garment sheet | Select one available owned garment; [Register intent] → B3. No clothing → [Register clothing] → C2 |
| R1 | Preferences | Free-text styles/exclusions. [AI interpretation] → R2 |
| R2 | Review interpretation | Edit/remove conditions; flag ambiguity. [Save] → B1 |

### 4.3 My Clothes Tab

| ID | Screen | Main elements and navigation |
|---|---|---|
| C1 | My clothes | Available/confirmed/withdrawn badges. [+ Register] → C2; card → C4 |
| C2 | Register/edit clothing | Camera/album photo and description. [Register] → C3. Warn that edits invalidate affected unconfirmed proposals |
| C3 | Review AI analysis | Correct estimated features and show checks. [Confirm] → C4; failure [Skip] → C4 |
| C4 | My clothing detail | Information, related intents/proposals (→ T2/T3). [Edit] → C2, [Withdraw] → confirmation. Confirmed garments cannot be edited/withdrawn; guide to cancellation → T3 |

### 4.4 Exchanges Tab

| ID | Screen | Main elements and navigation |
|---|---|---|
| T1 | Exchanges | Segments: My intents (→ B3, [Cancel]) / Active (alternative → A1, pending → T2) / Confirmed (→ T3) / History (invalidated/rejected/cancelled) |
| A1 | Alternative garment | Compare current/proposed clothing; preview cycle. [Accept] → server revalidation → T2; failure explanation → T1. [Reject] → T1. State that acceptance is not final consent |
| T2 | Pending proposal | Cycle diagram, offered/received clothing per participant, responses, version. [Consent]/[Reject] with confirmation. Read-only if invalidated; unanimous consent → T3 |
| T3 | Confirmed/handover | Who gives/receives what; explain confirmation is not completed handover. [Cancel exchange] → confirmation → T1 |

## 5. Core Flows

1. **Organizer:** S0 → H1 → H2 (share QR) → C2 → C3 → R1 → R2 → B1.
2. **New participant:** QR → P1 → P2 → C2 → C3 → R1 → R2 → B1 → B3 → I1 (register intent).
3. **Exchange:** Home pending card or Exchanges tab → T2 → [Consent] → T3 after unanimity.
4. **Alternative:** Home card → A1 → [Accept] → T2 → [Consent].
5. **On-site handover:** Confirmed tab → T3; inspect garments, [Cancel exchange] if needed.
6. **AI failure:** B1 error → manual selection in B2; C3 → [Skip].
7. **Closure:** Home manage card → M1 → H3 → closed.

## 6. Global States

- **Closed event:** show a banner everywhere; disable registration, intents, consent, cancellation. T3 remains view-only.
- **Version conflict:** if consent/acceptance is rejected, show a proposal-changed modal and reload current state.
- **Notifications:** no live chat; propose badges on Home/Exchanges and periodic refresh.
- **Organizer badge:** propose labeling organizers in proposals/clothing details.

## 7. Open Decisions

- **Session recovery:** settle returning-user verification before finalizing P1/organizer permission persistence. Losing the organizer session loses closure access; meanwhile propose a same-device notice on H2.
- **Handover completion:** decide whether T3 needs [Handover complete].
- **Showing interested participants:** decide whether C4 displays who wants the garment.
- **Proposal ordering:** define T1 sorting when multiple proposals exist.
- **Creation transaction:** events/participants reference each other. Create both and save `organizer_participant_id` in one transaction. Propose returning event information and organizer participant session together.
