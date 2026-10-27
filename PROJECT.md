# Introducing Vintage Relay

## Project Overview

Vintage Relay is a **mobile web app for a clothing exchange corner** at neighborhood events or small flea markets. Participants register garments they can offer and garments they want. AI helps find candidates matching their preferences, and the app connects participant choices into two-person swaps or three-person exchanges.

The goal is to connect multiple people's intents when finding a direct exchange partner is difficult. The app assists with recommendations and proposals, but **participants choose what to give and receive and consent to exchanges**.

The project is currently at the pre-implementation stage. This document describes the agreed direction and initial design; detailed API request/response formats and screen layouts will be decided later. See [idea.md](docs/domain/idea.md) for early ideas and validation background, and [vintage-relay-plan-v1.md](docs/plans/vintage-relay-plan-v1.md) for draft APIs and development order. Where their scopes differ, prioritize this document and the initial plan, which reflect later discussions.

The application interface, user-facing API messages, and AI-generated application copy are in English. Agent replies to the user remain in Korean.

## Users

- **Organizers:** create events, share QR or entry codes, and close events when finished.
- **Participants:** join before or during events, register clothing/preferences, and participate in exchanges.

The first version focuses on **a clothing exchange corner within an event**, rather than managing an entire event or facilitating sales.

## Basic Operating Rules

- An event becomes active immediately on creation, without a separate start time or button.
- Participants can join using a QR or entry code and register garments before or during the event. Candidate selection and final consent are also possible beforehand.
- A participant can register multiple garments and participate in multiple exchanges with different garments.
- **Each participant gives one garment and receives one garment per exchange.** Bundles such as two garments for one are excluded from the first version.
- The first version supports two-person swaps and three-person cycles. Cycles of four or more are out of scope.
- A garment cannot be confirmed in two exchanges. A confirmed garment is unavailable for other exchanges while its exchange remains valid.
- All participants must review and give final consent to the same proposal before confirmation. Expressing an intent alone does not confirm an exchange.
- Before event closure, a participant can cancel an entire confirmed exchange and make its garments available again. This flow assumes physical handover has not occurred.
- After the organizer closes the event, new exchanges and consent, confirmation, or cancellation of ongoing exchanges are prohibited.

Exchange confirmation and physical handover are separate states. Handling cancellation after some garments have already been handed over remains undecided.

## How the App Works

### 1. Event Creation and Entry

Creating an event registers the organizer as a participant and stores their participant ID as the event's organizer ID. The event becomes active immediately and provides a QR code and entry code. Other participants use these codes to join the same event room, whether beforehand or on site.

An entry code only grants entry to an event. Permissions to manage one's clothing/consent and the organizer's permission to close the event must be separate. Authentication and session recovery details will be decided later.

### 2. Clothing and Preference Registration

Participants upload photos and descriptions of garments to exchange, then enter desired styles and exclusions. Each participant can register multiple garments.

For example: “I want a cropped green jacket without a large logo, and I don't want heavy stains.” AI structures photo/description features and preference conditions for participants to review and correct.

### 3. Candidate Discovery and Exchange Intents

AI shows available clothing in the same event that matches a participant's preferences, along with reasons and points to check. Participants can also browse the list manually.

The initial design asks participants selecting a desired garment to **also specify which of their own garments they would offer**. For example: “I want to give my white pants for B's green jacket.” This is an exchange intent, not final consent.

### 4. Two-Person Swaps and Three-Person Cycles

The app connects independently registered intents. Selection order does not matter; it finds proposals once all required intents exist.

A **two-person swap** occurs when each person wants the other's garment. If I offer white pants for B's green jacket and B offers that jacket for my white pants, a proposal is possible.

A **three-person exchange** occurs when each desired garment's owner wants the next person's garment.

| Participant | Gives | Receives |
|---|---|---|
| Me | White pants → C | B's green jacket |
| B | Green jacket → me | C's black hoodie |
| C | Black hoodie → B | My white pants |

If all three register these intents, the server connects them into one proposal. If C does not want my pants, this exchange cannot happen. The app finds another option or reports no exchange found. AI estimates alone never create participant intents.

### 5. Alternative Garment Suggestions

When the current garments do not complete a cycle but offering **another registered garment** would, the app suggests that alternative to its owner.

For example, I offer white pants for B's green jacket, and B offers that jacket for C's black hoodie. If C offers the hoodie for my black jacket, the app can suggest:

> “Offering your black jacket instead of your white pants would make a three-person exchange possible. Would you like to review the proposal?”

I can accept or decline. The app never changes my intent on its own. On acceptance, the server rechecks event, clothing, and related intents, applies the intent change, and recalculates proposals. This acceptance is **not final exchange consent**. All three participants must review and consent to the completed proposal.

### 6. Final Consent and Conflicts

A proposal shows who gives and receives each garment. Each participant consents to or rejects the same version of the complete proposal.

One garment may appear in several unconfirmed proposals. Once unanimous consent confirms an exchange, the server rechecks garment availability and invalidates other unconfirmed proposals using those garments. Participants can continue in other exchanges using different garments.

If clothing/intent changes or withdrawals alter a proposal, affected existing consents are invalidated and participants must review again. The server and database prevent duplicate confirmation even under concurrent requests.

### 7. On-Site Inspection, Cancellation, and Closure

Participants view confirmed handover details, inspect physical garments on site, and exchange them. Confirmation does not mean handover is complete.

Before event closure, including after on-site inspection, a participant can cancel an entire confirmed exchange. Related garments not yet physically handed over become available again.

No exchange actions are allowed after the organizer closes the event. The initial design proposes canceling unconfirmed proposals and retaining confirmed records for viewing. Post-closure access/retention and handover completion records will be decided later.

## AI and Regular Code

| Role | Responsibility |
|---|---|
| **AI** | Summarize clothing photo/description features, interpret natural-language preferences/exclusions, and suggest candidates with reasons and checks. |
| **Regular server code** | Manage events/permissions, calculate two-/three-person exchanges, detect alternative garments, and handle consent, versions, duplicates, cancellation, and closure. |
| **Participants** | Review/correct clothing and preferences, select offered/desired garments, accept/decline alternatives, give final consent, and inspect physical garments. |

AI helps discovery by connecting preferences and garments. It never creates participant intents or final consent on their behalf. It must not state unseen defects, exact fit, authenticity, or prices as facts. Manual candidate selection must remain available if AI fails.

Meta Model API's `muse-spark-1.3` is the first candidate. Actual access, image input, structured output, and English recommendation quality must be validated early. Alternative garment detection and exchange cycle calculation use regular code.

## First-Version Technical Direction and Exclusions

- **Direction:** mobile web, Python FastAPI, SQLite, and server-side Meta Model API calls. An externally accessible deployment is needed for phone access before events.
- **Excluded:** cycles of four or more, bundles, payments, shipping, cash adjustments, live chat, nationwide event search, price/authenticity appraisal, virtual fitting, and native apps.
- **Open decisions:** event/participant authentication and session recovery, photo retention/deletion, physical handover records and subsequent cancellation, post-event record retention, event size limits, and proposal ordering.

Exchange demand and the value of AI recommendations remain unvalidated. Early development should compare actual model API integration and recommendations with manual selection, and verify two-/three-person exchanges, cancellation, and duplicate confirmation prevention.
