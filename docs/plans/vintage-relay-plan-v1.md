# Vintage Relay Initial Development Plan

## 1. Goal and Scope

Build a mobile web app for a **clothing exchange corner** at neighborhood events or small flea markets. Organizers create events, and participants join through QR or entry codes to register garments before or during the event. AI helps discover suitable garments; the app proposes two-/three-person exchanges based on participant choices.

This is an **initial plan**, focused on APIs and AI usage. The app/model integration has not been implemented or validated. Per-function API specs are in [api/](api/README.md) and [ai-features-v1.md](ai-features-v1.md). Paths, authentication, error codes, the 403/404 policy, and the proposal suppression rule are decided; request/response details marked **proposed** remain proposals until agreed. Screen designs will be decided later.

The application UI, user-facing API messages, and AI-generated application copy use English.

## 2. Agreed Operating Rules

- Creating an event registers its organizer as a participant and stores their participant ID as the event's organizer ID. The event becomes active immediately and generates QR/entry codes. No separate start procedure.
- Participants may join and register garments before or during the event. Candidate selection and final consent are also possible beforehand.
- Participants may register multiple garments and join multiple exchanges with different garments.
- Each participant **gives one garment and receives one garment** per exchange. Bundles such as two-for-one are excluded.
- Exchanges are two-person swaps or three-person cycles. No garment may be confirmed in two exchanges.
- If offering another registered garment would enable an exchange, the app detects it and suggests a change. Never change intents without the participant's choice.
- Confirmation requires every participant's consent to the same proposal. Candidate interest and final consent are distinct.
- Before closure, cancellation by a participant cancels the entire confirmed exchange and makes related garments available again, including after on-site inspection.
- No further exchange actions are allowed once the organizer closes the event.

Confirmation does not mean physical handover is complete. Restoring availability on cancellation applies before handover. Cancellation after partial handover needs a separate policy.

## 3. User Flow

1. **Create event:** organizer creates an event and shares its QR/entry code.
2. **Join:** participants enter using the code before or during the event.
3. **Register clothing:** upload photos and descriptions.
4. **Enter preferences:** specify desired styles and exclusions.
5. **Discover candidates:** AI suggests candidates with reasons/checks; participants may also browse manually.
6. **Select exchange intent:** choose a desired garment. The initial design proposes also specifying an owned garment to offer.
7. **Alternative garment suggestion:** if another owned garment enables an otherwise impossible exchange, suggest it for acceptance/rejection.
8. **Exchange proposal:** find two-/three-person exchanges from chosen intents. There may be no possible exchange.
9. **Final consent:** each participant reviews the complete proposal, including offered/received garments, and consents or rejects.
10. **On-site inspection/handover:** inspect confirmed details and physical garments before handover; cancel before closure if needed.
11. **Close event:** organizer closes the event; exchange actions stop.

Alternative example: I offer white pants for B's green jacket; B offers that jacket for C's black hoodie; C offers that hoodie for my black jacket. If my black jacket is available, suggest **offering it instead of the white pants to enable a three-person exchange**. Acceptance does not confirm the exchange; all three must give final consent to the complete proposal.

## 4. Required Internal APIs

Names below describe functionality, not actual paths. Detailed draft specifications (paths, headers, requests, responses, errors) are split into one document per function under [api/](api/README.md).

| Function | Request and required processing | Spec |
|---|---|---|
| Create event | Create event, register creator as participant, link organizer ID, activate immediately, generate entry code and QR link. | [01-create-event](api/01-create-event.md) |
| Read event | Return event information and active/closed state. | [02-read-event](api/02-read-event.md) |
| Close event | Verify organizer, close event, block new registration, intent changes, consent, confirmation, and cancellation. | [03-close-event](api/03-close-event.md) |
| Join event | Validate QR link/entry code and create a participant session. | [04-join-event](api/04-join-event.md) |
| Upload photo | Store photo and associate it with clothing registration for the event/participant. | [05-upload-photo](api/05-upload-photo.md) |
| Register/read clothing | Save photos/descriptions; return same-event lists/details. | [06-register-read-clothing](api/06-register-read-clothing.md) |
| Edit/withdraw clothing | Owner edits or withdraws clothing. Invalidate affected unconfirmed proposals/consent. Cancel confirmed exchanges before editing confirmed garments. | [07-edit-withdraw-clothing](api/07-edit-withdraw-clothing.md) |
| Register/edit preferences | Save desired styles and exclusions. | [08-preferences](api/08-preferences.md) |
| AI recommendations | Return candidates, reasons, and checks based on available same-event clothing and preferences. | [ai-features-v1](ai-features-v1.md#5-recommendations) |
| Select/withdraw intent | Select or withdraw desired garments; initial design also specifies owned offered garments. Invalidate affected unconfirmed proposals/consent. | [09-intents](api/09-intents.md) |
| Find/read alternatives | Compare intents with available owned clothing, finding two-/three-person cycles enabled by changing the offered garment. Recompute after clothing/intent changes. | [10-alternative-suggestions](api/10-alternative-suggestions.md) |
| Accept/reject alternative | Owner accepts/rejects. On acceptance, revalidate event/clothing/related intents and apply the chosen intent change. Rejection/invalid suggestions never automatically change existing intents. | [10-alternative-suggestions](api/10-alternative-suggestions.md) |
| Create/read proposal | Calculate two-/three-person exchanges from selected intents and show each participant's offered/received clothing. | [11-proposals](api/11-proposals.md) |
| Consent/reject proposal | Verify participant/version and record response. On unanimous consent, recheck event/conflicts and confirm. | [12-consent-reject-proposal](api/12-consent-reject-proposal.md) |
| Cancel confirmed exchange | Before closure, a party cancels the entire exchange; related garments not yet handed over become available again. | [13-cancel-exchange](api/13-cancel-exchange.md) |
| Read confirmation/handover | Show who gives/receives what; distinguish confirmation from completed physical handover. | [14-confirmed-exchanges](api/14-confirmed-exchanges.md) |

The initial design proposes **canceling unconfirmed proposals on closure and retaining confirmed records for viewing**. Separate handover recording after closure remains undecided.

QR/entry codes grant event entry only. Manage participant sessions and organizer permissions separately so they cannot authorize editing another's clothing, consenting for others, or closing the event.

## 5. AI Technology and External APIs

Detailed draft specification: [ai-features-v1.md](ai-features-v1.md).

### Base Model

First consider only **Muse Spark 1.3 (`muse-spark-1.3`)** through Meta Model API. Model documentation lists image understanding and structured output. Verify account access, actual calls, English preference interpretation, and recommendation quality on day one. [Meta model documentation](https://dev.meta.ai/docs/models)

| AI task | Input | Required output |
|---|---|---|
| Clothing features | Photos and owner's description | Type, color, visible features, points to check |
| Preference interpretation | Desired styles and exclusions | Comparison conditions and ambiguous expressions |
| Recommendations | Preferences and event clothing information | Candidates to inspect, reasons, points to check |

- Participants must be able to review/correct AI clothing information and preferences.
- Never present unseen defects, exact fit, authenticity, or prices as verified facts.
- Server rechecks event membership and current availability of recommended garments.
- Regular code compares existing intents/clothing for alternatives. AI never changes intents or consents on anyone's behalf.
- Allow manual clothing selection on model errors/delays.
- Prioritize direct backend model calls. Additional training, vector DBs, image generation, speech processing, and AI agent tool calling are not required for the first version.

### AI and Regular Code

| AI | Regular code and people |
|---|---|
| Connect photos/descriptions to natural-language preferences. | Participants select desired/offered garments. |
| Explain reasons and checks. | Server calculates two-/three-person cycles from approved intents. |
| Flag ambiguity and unverified information. | Participants consent; server checks permissions, versions, duplicates, and event state. |

Recommendations never automatically create exchange intents or final consent.

## 6. Exchange State and Conflicts

- Unconfirmed proposals may share garments, but **each garment can be finally confirmed in only one exchange**.
- On unanimous consent, recheck active event, version, consents, ownership, and availability; perform confirmation in one DB transaction.
- Confirmation invalidates other unconfirmed proposals/consents sharing the garments.
- Clothing/intent changes invalidate affected unconfirmed proposals' existing consents.
- Alternative suggestions are hypothetical, not confirmed intents or final consent. Revalidate on acceptance and recalculate from changed intents. On failure, leave unchanged and search again.
- Serialize closure/final consent consistently in server/DB so concurrent requests cannot create confirmations after closure.
- Before closure, cancellation cancels the entire exchange, makes garments not yet handed over available again, and allows new proposal discovery.
- Even participants in multiple exchanges give/receive one garment **in each proposal**.

## 7. Draft Architecture

- **Screens:** mobile web used on phones.
- **Server:** Python FastAPI.
- **Data:** SQLite stores events, participants, clothing, intents, proposals, consent, and states. Because consistency relies on serialized SQLite writes, deploy on an **always-on single server with persistent disk**. No serverless/multi-instance deployment.
- **Photos:** store on an externally accessible server; choose storage details for the deployment environment.
- **AI:** call Meta Model API server-side; keep keys only on the server.
- **Access:** provide a deployment URL accessible from individual phones before events. A local development server alone cannot satisfy this flow.

This draft builds on the solo seven-day plan. Reassess storage/operations for actual concurrency and deployment conditions.

## 8. Draft Development and Validation Order

1. **Core validation:** test Meta access, photo input, structured output, and English interpretation. Define manual-selection comparisons and criteria in advance.
2. **Events/entry:** creation, immediate activation, QR/code, participant and organizer authorization.
3. **Clothing/preferences:** upload, register/edit/withdraw, preferences, manual selection.
4. **AI candidates:** feature extraction, interpretation, recommendations, correction, manual fallback.
5. **Proposals:** two-/three-person calculation, alternative detection/acceptance/rejection, proposal viewing.
6. **Consent/cancellation:** unanimity, versions, duplicate prevention, entire-exchange cancellation, closure.
7. **End-to-end verification:** pre-event registration through confirmation, on-site inspection, cancellation/closure. Include concurrency, proposal changes, no matches, and AI failures.

Compare real users' candidate review time, missed conditions, and correction burden against manual selection. Finding cycles for fictional participants validates exchange logic, not actual demand or AI impact.

## 9. First-Version Exclusions and Open Decisions

**Excluded:** payments, shipping, cash adjustments, bundles, live chat, nationwide event search, price/authenticity appraisal, virtual fitting, native apps.

**Decisions needed:**

- Organizer/participant session recovery on another device, and photo retention/deletion. (Authentication is decided in the [API contract](../rules/dev/common/api-contract.md#authentication-decided).)
- Whether to specify owned offered clothing when selecting intents or only during final proposal review. This document proposes specifying it early.
- Who records completed handover and how; cancellation after partial handover.
- Post-closure access and retention of confirmed records.
- Initial participant/garment limits and ordering among multiple proposals.
