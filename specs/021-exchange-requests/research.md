# Research: 020 Exchange Requests and Proposals

**Date**: 2026-11-03 · **Spec**: specs/021-exchange-requests/spec.md

## Decisions

### 1. Write transactions use `Db.write()` (`BEGIN IMMEDIATE`)

- **Decision**: All intent/proposal/consent/retrofit mutations run inside `Db.write()` (SQLite `BEGIN IMMEDIATE`), one transaction per endpoint, following `backend/app/core/db.py:36-55`.
- **Rationale**: Serializes concurrent final consent and event closure; matches existing `ClothingService.register/edit/withdraw` and `EventService.close` patterns.
- **Alternatives considered**: Per-row locking (SQLite has none); `SELECT FOR UPDATE` (not available) — rejected.

### 2. Same-transaction recalculation via `domain/matching.py` pure functions

- **Decision**: New pure module `backend/app/domain/matching.py` for 2-/3-person cycle detection, `cycleKey` (participant/offered/received entries sorted by participant), and suppression check. Services call it inside the same `Db.write()` transaction that changed intents/clothing and reuse/insert proposals.
- **Rationale**: Keeps cycle logic testable without DB; satisfies API 11 rules 1–6 and retrofit points (07 PATCH steps 6–7, DELETE steps 6–7, 03 close invalidation).
- **Alternatives considered**: DB triggers / background job — rejected (must be same-transaction per spec).

### 3. New tables mirror `docs/plans/database-design-v1.md` 3.7–3.9 + §7 indexes

- **Decision**: SQLAlchemy models `ExchangeIntent`, `TradeProposal`, `TradeParticipant` + migration; partial unique indexes `(event_id, cycle_key)` while pending and `offered_clothing_id` where `is_confirmed`.
- **Rationale**: Enforces no-double-pending-cycle and no-double-confirmation at DB level plus conditional `clothes.status available→confirmed` updates.
- **Alternatives considered**: Application-only checks — rejected (concurrency requirement).

### 4. Error mapping follows existing `domain/errors.py` + `api/errors.py`

- **Decision**: Add `IntentNotActiveError`, `ProposalVersionMismatchError` (with `currentStatus`/`latestProposalId` details), reuse `ClothingAlreadyConfirmedError`, `ClothingNotAvailableError`, `EventClosedError`; 404-hiding for intents/proposals outside sender/owner/participants per contract §7/§9.
- **Rationale**: Matches check order (parse → auth → existence/scope → role → replay → event-state → feature-state) and contract error format.
- **Alternatives considered**: None.

### 5. Frontend via `apiFetch(eventId, path)` + TanStack Query, Astryx templates

- **Decision**: New `lib/api/intents.ts`, `lib/api/proposals.ts` (eventId selects token even for top-level `/intents/{id}`, `/proposals/{id}` paths), types in `src/types/`, query keys via `query-keys.ts` factory; polling T2 5s (pending), T1/C4/badge 15s, stop when terminal; proposal-changed modal on 409; `/impeccable critique|audit` on I1/T1/T2/C4 per frontend rules.
- **Rationale**: Follows `data-fetching.md` §§1–4 and existing `clothing.ts`/`search.ts` patterns; Next.js guide in `node_modules/next/dist/docs/` + Astryx workflow (template-first, no `<div>`, `astryx doctor --built`).
- **Alternatives considered**: Optimistic consent updates — rejected (must not optimistically update consent per data-fetching.md).

## Explorer findings (2026-11-03, applied)

- Write lock: `backend/app/core/db.py:36-56` `Db.write()` = `BEGIN IMMEDIATE`, WAL + `busy_timeout=5s`; all mutations join invalidation/recalc in the same `with db.write()` block.
- Retrofit points: `ClothingService.edit` commit `backend/app/services/clothing.py:355-369`, invalidate after `L358 s.flush()` with `clothing_changed`; `withdraw` commit `L383-404`, invalidate around `L404` with `clothing_withdrawn`; `EventService.close` commit `backend/app/services/event.py:181-189`, invalidate after `L185 mark_closed` with `event_closed`. Replace hardcoded `invalidated_*_count: 0` logs (`clothing.py:377,409-410`, `event.py:194`) with real counts.
- Frontend session: `frontend/src/lib/session.ts:22-39` (`vr:event:{eventId}`) + `apiFetch(eventId, path)` (`frontend/src/lib/api/client.ts:8-23`) attaches token; top-level paths still called with eventId from Next params (same as `clothing.ts:53-60 getClothing`).
- Placeholders: T1 `trades/page.tsx` + `TradesOnboardScreen.tsx` (3 tabs onboarding); B3 disabled `Request exchange` (`ClothingDetailScreen.tsx:211-212`); C4 `Requests` heading (`MyItemDetailScreen.tsx:250-253`); T2 route `app/events/[eventId]/trades/[tradeId]/page.tsx` new.
- No existing intent/proposal/matching code or tables (migrations cover events/participants/photos/clothes/analyses only). Reuse: pure `search.py:133-181 rank` pattern for `matching.py`; `api/deps.py:33-48 TokenParticipant`; `domain/errors.py:36 ConflictError` subclassing.
- Risks confirmed: double-confirm guard via partial unique on `is_confirmed` + savepoint rollback + conditional `available→confirmed`; 404-hiding (contract §9); version passthrough + disable consent on change; polling T2 5s pending-only, lists 15s, no background polling.

## Resolved clarifications

- Confirmation elsewhere invalidates pending proposals only (not other active requests) — decided 2026-11-03.
- Exchanges ordering newest first (`createdAt` desc) — decided 2026-11-03.
