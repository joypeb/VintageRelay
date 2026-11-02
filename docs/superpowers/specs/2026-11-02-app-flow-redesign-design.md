# App Flow Redesign: Tabs, AI Search, Exchange Requests

**Date**: 2026-11-02 · **Status**: Approved 2026-11-02 · **Replaces**: parts of `docs/flows/screen-flow-v1.md` and `docs/plans/api/08–14`, `docs/plans/ai-features-v1.md`

## 1. Intent

After features 001–014 (create/join event, photo upload, clothing registration form), the user redefined how the app should feel: a simple marketplace-style app with four bottom tabs, natural-language search powered by AI, and visible exchange requests between participants. The exchange engine (intents, 2-/3-person cycles, unanimous consent) stays; it is presented as "requests" instead of hidden intents. Preferences and AI recommendations are replaced by search.

Why: the earlier plan (hidden intents, preference text, AI-ranked recommendations, AI review screen) has many screens and few visible signals at a 3–6 person event. Seeing incoming requests and searching by plain words makes the app feel alive and is simpler to build and demo.

## 2. Goals, Non-goals, Anti-goals

**Goals**
- Landing lists events already joined on this device, then Create / Join (code or QR).
- Inside an event, four bottom tabs: **Home**, **Search**, **Trades**, **My items**.
- Home: latest other participants' garments, 2 per row, photo on top, title below.
- Search: natural language → AI turns it into conditions (category, color, measurements) → ranked results.
- My items: register (existing 014 form), edit, delete; tapping an item shows requests received for it.
- Registration/edit triggers backend AI analysis asynchronously.
- Trades: received requests, sent requests, exchanges (awaiting confirmation, 3-person found, confirmed).

**Non-goals (dropped or deferred from the earlier plan)**
- Preferences (R1/R2, API 08) and AI recommendations (B1, `GET /recommendations`): **dropped**, replaced by Search.
- AI analysis review screen (C3) and `POST/PATCH /clothing/{id}/analysis` client calls: **dropped**; analysis runs in the backend.
- Alternative suggestions (A1, API 10): **deferred**.
- Counter-offers ("offer a different item"): out of scope.
- Search history, saved searches, notifications/push.

**Anti-goals**
- Losing 3-person cycles (core rule in `AGENTS.md`; key differentiator in `docs/domain/idea.md`).
- Search where the AI decides ranking or invents conditions; ranking must be deterministic and explainable.
- Showing AI estimates (color) as owner facts.

## 3. Constraints

- `AGENTS.md`: English UI/docs, TDD, Spec Kit delegation, review before commit.
- `docs/rules/dev/common/api-contract.md` stays the sole API contract; `PUT` is forbidden; existing error codes reused where possible (`AI_UNAVAILABLE` 503 already exists).
- Model calls only from the backend with `META_API_KEY` (`tech-stack.md`).
- Exchange rules unchanged: one-for-one, a garment confirmed in at most one exchange, all participants consent to the same proposal version, cancel before close.

## 4. Decided by the User

### 4.1 Navigation and screens

| Screen | Behavior |
|---|---|
| Landing | "Your events" list first when this device holds sessions; then [Create event], [Join with code or QR] |
| Home tab | Other participants' garments only, newest first, 2-column grid, 3:4 photo then title. Card → item detail |
| Item detail (other's) | Photo carousel, category, AI color (labelled as AI), measurements, description, [Request exchange] |
| Search tab | Text input; interpreted conditions as removable chips; ranked 2-column results; [Edit filters] |
| Trades tab | Segments: Received, Sent, Exchanges (awaiting my confirmation, 3-person found, confirmed) |
| My items tab | [+ Register item] (014 form), item rows with status, edit, delete; tapping an item shows requests received for that item |

Mockup: [`docs/flows/mockup-flow-v2.html`](../../flows/mockup-flow-v2.html) (approved as is).

### 4.2 Exchange requests (option A)

1. Requester taps [Request exchange] on another garment and picks one of their own available garments → this is an **intent** (API 09).
2. The wanted garment's owner sees it under Trades → Received (and on that item in My items) with [Accept] / [Decline].
3. **Accept**: server creates the reverse intent, which forms a 2-person cycle; the proposal is created in the same transaction and the accepter's consent is recorded.
4. Requester sees "accepted — confirm?" under Sent/Exchanges and consents → confirmed.
5. **Decline**: the request shows as declined to the requester.
6. 3-person cycles are still detected automatically from active intents and shown to all three under Exchanges; all three consent.

Changes to the earlier plan: an intent is visible to the owner of the wanted garment (was hidden), and intents gain a `declined` status.

### 4.3 Search ranking

- AI turns text into conditions: `category`, `colors`, measurement ranges.
- **Category is a hard filter**: different category → excluded.
- Each other condition (each color condition, each measurement) that matches adds 1 point. Sort by points descending.
- Ties: when measurement conditions exist, garments with entered measurements come before garments without; then newest first.
- Garments without a done analysis never match color conditions (still matched on category/measurements).
- If the AI call fails: show an error and let the user pick conditions manually; manual conditions use the same ranking.

### 4.4 AI analysis

- Starts in the backend right after a registration or edit is saved; the response does not wait for it.
- An edit makes the old analysis stale and starts a new one.
- No review screen; results appear on item detail labelled as AI estimates.

## 5. Builder's Calls (mine; change if wrong)

- **Search API split**: `POST /api/v1/events/{event_id}/search/interpretation` `{ "text" }` → `{ category|null, colors[], measurements{ <name>: {min,max} }, unrecognized[] }` (AI); `GET /api/v1/events/{event_id}/clothing/search?category=&color=&chestMin=&chestMax=...` → ranked others' `available` garments with `matchCount` (no AI). Manual fallback uses only the second endpoint.
- **Fixed color vocabulary** shared by analysis output and search conditions so they can match: `black, white, gray, beige, brown, red, orange, yellow, green, blue, navy, purple, pink, multicolor`.
- **Single measurement value** in text ("chest 21") becomes a ±1 inch range.
- **Async mechanism**: FastAPI `BackgroundTasks` after commit, one retry, status `pending → done | failed`, keyed by `contentVersion`. `shortcut: lost if the process restarts mid-analysis, upgrade to a job queue if analyses go missing in practice`.
- **Analysis output**: `colors` (vocabulary above), `pattern`, `materialEstimate`, `styleTags`, `uncertainties`. AI `category`/`subcategory` dropped; owner category is the source of truth (resolves the open decision in `ai-features-v1.md`). Model gets the first 3 photos plus owner title, category, description, measurements.
- **Accept/Decline endpoints**: `POST /api/v1/intents/{intent_id}/accept` (owner of the wanted garment; returns the proposal) and `POST /api/v1/intents/{intent_id}/decline`. Received/sent lists: `GET /events/{event_id}/intents?direction=received|sent`.
- **Home** shows only `available` garments; confirmed ones disappear from Home.
- **Landing list** reads `vr:event:*` sessions from `localStorage` and loads each event via `GET /events/{id}` (API 02) for name and status; entries answering 401/404 are removed.
- **Request without own items**: the offer sheet shows [Register item] → 014 form. Duplicate and multiple requests follow API 09 (same offered/wanted pair returns the existing intent; different offers are separate requests). A declined requester may send a new request.
- **Organizer tools**: existing Manage event screen stays reachable from a header menu, not a fifth tab.
- **Closed event**: all tabs stay readable; request, accept, register, edit, delete are hidden.
- **Edit/delete before exchanges exist**: API 07 ships first without intent/proposal invalidation; the exchange feature adds those steps.

## 6. Roadmap (Spec Kit features, in order)

| # | Feature | Area | Depends on |
|---|---|---|---|
| 015 | App shell: landing event list + 4 bottom tabs (empty states for Search/Trades) | FE | — |
| 016 | Home grid + other's item detail | FE (API 06 exists) | 015 |
| 017 | My items: list, item detail, edit/delete (API 07) | BE + FE | 015 |
| 018 | Async AI analysis on register/edit | BE (+ FE badge and AI color on detail) | 017 |
| 019 | AI search: interpretation + ranked search + manual filters | BE + FE | 018 |
| 020 | Exchange requests: intents with visibility/decline, accept → 2-person proposal, 3-person cycle detection, consent, confirmation (APIs 09, 11, 12) | BE + FE (request sheet, Trades, received requests on item) | 016, 017 |
| 021 | Cancel confirmed exchange + confirmed/handover view (APIs 13, 14) | BE + FE | 020 |

Order rationale (user decision: AI search before exchanges): browsing and managing items first (cheap, needed by everything), then AI analysis and search (search depends on analysis colors), then the exchange core, then cancellation. Until 020 ships, the Trades tab and [Request exchange] show an empty/coming-soon state.

## 7. Documents to Update Before 015

Done on 2026-11-02, together with `PROJECT.md`, the main plan, database design, API contract, and the affected dev rules. New: [`api/15-search.md`](../../plans/api/15-search.md).

- `docs/flows/screen-flow-v1.md`: tabs Home | Search | Trades | My items; remove B1/R1/R2/C3/A1; add Search and Trades screens.
- `docs/plans/api/09`: owner visibility, `declined`, `direction` filter, accept/decline endpoints.
- `docs/plans/api/README.md`: mark 08 and recommendations dropped, 10 deferred; add search endpoints.
- `docs/plans/ai-features-v1.md`: backend-triggered analysis, new search interpretation, drop preference interpretation and recommendations.

## 8. Left to the Builder

- Exact field names and error tables for the new endpoints, following the contract.
- Whether other received requests for a garment are invalidated when it is confirmed elsewhere (follow existing invalidation rules).
- Visual design within Astryx; empty and loading states.
