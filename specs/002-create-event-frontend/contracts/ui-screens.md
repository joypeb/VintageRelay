# UI Contract: S0 / H1 / H2 and Consumed API

## Consumed API

`POST /api/v1/events` — defined by [`specs/001-create-event/contracts/create-event.openapi.yaml`](../../001-create-event/contracts/create-event.openapi.yaml). No `Authorization` header (`apiFetch(null, '/events', …)`).

| Response | Frontend handling |
|---|---|
| `201` `EventSession` | Save device record, `router.replace` to H2 |
| `422 VALIDATION_ERROR` `details.fields[]` | Map `name` / `organizerDisplayName` reasons under fields; anything else → form-level generic |
| `400 BAD_REQUEST`, `500 INTERNAL_ERROR` | Form-level: server `message` |
| non-standard body (e.g., HTML 502) | `UNKNOWN_ERROR` → form-level generic |
| network failure / 15 s timeout | `NETWORK_ERROR` → form-level `ApiError` message |

## Routes (`src/lib/routes.ts`)

| Screen | Path | Builder |
|---|---|---|
| S0 Landing | `/` | `routes.landing()` |
| H1 Create event | `/events/new` | `routes.createEvent()` |
| H2 Created/share | `/events/{eventId}/created` | `routes.eventCreated(eventId)` |
| P1 Join (placeholder) | `/join` | `routes.join()` |
| P2 Home (placeholder) | `/events/{eventId}` | `routes.eventHome(eventId)` |
| C2 Register clothing (placeholder) | `/events/{eventId}/my-items/new` | `routes.newItem(eventId)` |

`eventId` is URL-encoded by the builders.

## S0 Landing (`components/event/LandingScreen.tsx`)

- Heading "Vintage Relay"; text "Event clothing exchange corner" and "Give one garment, receive one garment".
- Primary button "Create event" → H1. Secondary button "Join with entry code" → P1.
- Helper text "Scan the event QR with your phone camera to join".

## H1 Create event (`components/event/CreateEventScreen.tsx`)

| Element | Accessible name / text | Behavior |
|---|---|---|
| Heading | "Create event" | |
| Text input | label "Event name", `autoComplete="off"`, `enterKeyHint="next"` if supported | Enter → focus display name |
| Text input | label "My display name", `autoComplete="nickname"` | Enter → submit |
| Note | "Creating an event also registers you as a participant." | |
| Note | "The event starts immediately. There is no separate start button." | |
| Field error | directly below its input; `aria-invalid` + `aria-describedby` (Astryx `status`) | Cleared when that field changes |
| Form error | near the button, `role="alert"` | |
| Button | "Create event", `type="submit"` | `isLoading` while pending |

## H2 Created/share (`components/event/EventCreatedScreen.tsx`)

| Element | Accessible name / text | Behavior |
|---|---|---|
| Heading | "Event created" | |
| Event name | visible text, exactly `share.name` | Lets the organizer confirm which event this is |
| Text | "Share the QR code or entry code with participants" | |
| QR | `role="img"`, title "QR code to join {event name}" | Encodes `entryUrl` exactly |
| Entry code | label "Entry code", large monospace text | Exactly `entryCode` |
| Button | "Copy link" | Success → live text "Link copied"; failure → selectable link + "Copy this link manually." |
| Notice | "Organizer access is stored on this device. Use the same device until the event ends." | |
| Button | "Register my clothes" (primary) | → C2 |
| Button | "Go home" (secondary) | → P2 |
| Missing data | "This event's share details aren't saved on this device." + button "Go to start" | → S0 |

## Placeholder (`components/ui/ComingSoonScreen.tsx`)

Props `title`. Shows the title, "This screen is coming soon.", and button "Go to start" → S0.

## Layout constraints (all screens)

Single column inside the root `max-w-md` container; usable at 360–430 px with no horizontal scroll; touch targets ≥ 44×44 px; input text ≥ 16 px; Astryx components and token utilities only (QR colors are the documented exception, research R10).
