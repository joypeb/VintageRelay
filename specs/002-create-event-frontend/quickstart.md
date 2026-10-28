# Quickstart: Create Event Frontend (Mobile)

Validation guide for S0 → H1 → H2. Screen contract: [contracts/ui-screens.md](contracts/ui-screens.md). Decisions: [research.md](research.md).

## 1. Prerequisites

- Node 24, pnpm 12 (`corepack enable`), uv for the backend.
- Backend from `specs/001-create-event` (see its [quickstart](../001-create-event/quickstart.md)).

## 2. Automated checks

```bash
cd frontend
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass. `pnpm test` includes the unit and component tests listed in research R13.

## 3. Run locally (desktop browser, phone-width viewport)

```bash
# Terminal 1 — backend
cd backend
DATABASE_URL=sqlite:///./data/app.db APP_BASE_URL=http://localhost:3000 uv run fastapi dev app/main.py

# Terminal 2 — frontend (frontend/.env.local)
#   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
cd frontend
pnpm dev
```

Open `http://localhost:3000` with device emulation at 360 px and 430 px width.

| # | Scenario | Expected |
|---|---|---|
| 1 | S0 → [Create event] | H1 with two empty labeled fields and both notes |
| 2 | Submit with both fields empty | No network request; both field messages; focus on "Event name" |
| 3 | Event name of 61 characters (or 61 Korean syllables) | "Use at most 60 characters."; exactly 60 is accepted |
| 4 | Display name "Mina" + pasted text with an inner line break | "Remove line breaks and tabs." |
| 5 | Valid values with surrounding spaces, tap [Create event] twice quickly | One `POST /api/v1/events` in the Network tab; H2 shows the event name trimmed (no surrounding spaces) |
| 6 | On H2 | 6-character code, QR, same-device notice; `localStorage` has `vr:event:{id}` |
| 7 | [Copy link] on `localhost` | "Link copied"; clipboard holds `http://localhost:3000/join?code=…` |
| 8 | Browser back from H2 | Returns to S0, not a filled H1 |
| 9 | Reload H2 | Same share info |
| 10 | Open `/events/unknown-id/created` | "share details aren't saved" message + [Go to start] |
| 11 | [Register my clothes] / [Go home] | "coming soon" placeholders for the event |
| 12 | Stop the backend, submit valid values | Connection message near the button; input kept; works again after restart |
| 13 | Private window with storage blocked (or DevTools storage quota 0) | Form-level message to use a regular window; no request sent |
| 14 | Search console output | No token, `Authorization` value, or entry code logged |

## 4. Phone and QR check (SC-002)

Use the LAN address of the dev machine (`<LAN-IP>`), so the QR doesn't point at `localhost`:

```bash
# backend
APP_BASE_URL=http://<LAN-IP>:3000 DATABASE_URL=sqlite:///./data/app.db uv run fastapi dev app/main.py --host 0.0.0.0
# frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://<LAN-IP>:8000
pnpm dev --hostname 0.0.0.0
```

If Next blocks dev requests from the LAN origin, add it to `allowedDevOrigins` in `next.config.ts` for the session (don't commit a personal IP).

1. On phone A, create an event; confirm the layout fits without horizontal scroll and the button stays reachable with the keyboard open.
2. Scan H2's QR with phone B's camera 10 times (different people if possible): ≥ 9 reach `/join?code=…` on the first try.
3. On phone A, [Copy link] shows the manual-copy fallback (LAN `http://` is not a secure context) with a selectable link.
4. Take screenshots of S0, H1 (with an error), and H2 at 360 px and 430 px for the PR (`docs/rules/dev/common/testing.md` §4).
