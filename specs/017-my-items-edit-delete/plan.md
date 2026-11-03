# Implementation Plan: 017 My Items Edit/Delete

**Branch**: `feature/017-my-items-edit-delete` | **Date**: 2026-11-03 | **Spec**: specs/017-my-items-edit-delete/spec.md

**Input**: specs/017-my-items-edit-delete/spec.md

## Summary

Add owner edit/withdraw on the backend (PATCH/DELETE with whole-list photo replacement, whole-object measurements, replay, contentVersion bump) and the owner workspace on the frontend (C1 list, C4 detail+delete, C2 edit reusing the 014 form, registration lands on C1). Skip 018 analysis and 020 invalidation; keep confirmed guards.

## Technical Context

**Language/Version**: Python 3.12, FastAPI, SQLAlchemy, SQLite; TypeScript 6, Next.js 16.4, React 19

**Primary Dependencies**: Pydantic v2, `BackgroundTasks` (unused here), TanStack Query 5, zod 4, Astryx 0.7.4 + theme-chocolate

**Storage**: SQLite (`clothes`, `photos` with `UniqueConstraint(clothing_id, position)`); detached photos stay stored

**Testing**: backend `uv run pytest`; frontend `vitest` + Testing Library, colocated `*.test.ts(x)`

**Target Platform**: Mobile web

**Project Type**: Web application (backend + frontend)

**Performance Goals**: PATCH/DELETE single transaction; C1 one list read, C4 one detail read; no polling

**Constraints**: English UI; Astryx components only; routing-only `page.tsx`; all HTTP via `apiFetch`; bearer tokens only as `Authorization`; never log title/description/photo bytes

**Scale/Scope**: Neighborhood events, tens of garments; 2 endpoints + 3 screens

## Constitution Check

- **I. Exchange Integrity**: No intents/proposals/consent touched. Confirmed garments locked (`CLOTHING_ALREADY_CONFIRMED`). Invalidation deferred to 020 with counts logged as 0. Pass.
- **II. Test-First**: Pure validation, reorder logic, ranking-free; failing tests before impl in tasks.md. Pass.
- **III. Test Scope**: Unit for validators/service replay; API integration for 403/404/409/422; frontend unit for parsing/fetchers/hooks + screens manual at 360–430px. Pass.
- **IV. Isolated, Deterministic**: DB transactions in tests via fixtures; `apiFetch` mocked; no external services. Pass.
- **V. Simplicity**: Reuse registration validators, `_build_response`, 014 form/carousel; no new deps. Pass.

Re-check after design: 017 defers API 07 PATCH steps 5-7 and DELETE steps 6-7 (analysis + invalidation); this is a behavioral deferral that amends API 07 in the same PR, not a non-change.

## Project Structure

### Documentation (this feature)

```text
specs/017-my-items-edit-delete/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── edit-clothing.md
│   └── withdraw-clothing.md
└── tasks.md
```

### Source Code

```text
backend/app/
├── schemas/clothing.py          # ADD ClothingUpdate
├── services/clothing.py         # ADD edit(), withdraw()
├── repositories/photo.py        # ADD detach/reorder helpers (or inline UPDATE)
├── api/routers/clothing.py      # ADD PATCH + DELETE
├── api/errors.py                # MAP new errors
└── domain/errors.py             # ADD AlreadyConfirmed, NotAvailable

backend/tests/
├── api/test_edit_clothing.py    # NEW
└── api/test_withdraw_clothing.py# NEW

frontend/src/
├── app/events/[eventId]/(tabs)/my-items/page.tsx              # REPLACE placeholder -> C1
├── app/events/[eventId]/(tabs)/my-items/[itemId]/page.tsx      # NEW C4
├── app/events/[eventId]/(tabs)/my-items/[itemId]/edit/page.tsx # NEW C2 edit
├── components/clothing/MyItemsList.tsx        # NEW rows
├── components/clothing/MyItemDetailScreen.tsx # NEW (or reuse ClothingDetailScreen + owner actions)
├── components/clothing/PhotoUploadScreen.tsx  # EXTEND initialPhotos
├── lib/photo/queue.ts           # LOOSEN file?, ADD factory
├── lib/api/clothing.ts          # ADD list mine/update/delete
├── lib/api/query-keys.ts        # ADD ownership in key
├── lib/validation/clothing-form.ts # ADD buildUpdateBody
└── lib/routes.ts                # ADD myItems builders
```

**Structure Decision**: Backend follows existing service/repo/router layering; frontend keeps screen bodies in `components/clothing/`, pages routing-only, following 016 pattern.

## Complexity Tracking

No violations; photo NULL-staging is required by SQLite semantics, not complexity.
