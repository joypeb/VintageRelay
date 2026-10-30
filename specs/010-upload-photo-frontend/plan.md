# Implementation Plan: Upload Photo Frontend (Mobile)

**Branch**: `feature/frontend-upload-photo` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-upload-photo-frontend/spec.md`

## Summary

Replace the C2 (`my-items/new`) "coming soon" placeholder with the photo upload step, built on `POST /api/v1/events/{eventId}/photos` from `specs/009-upload-photo`.

- **Route**: `app/events/[eventId]/(tabs)/my-items/new/page.tsx` (server component) passes `eventId` to a client `PhotoUploadScreen` (R1).
- **Data**:
  - `uploadPhoto(eventId, file)` builds `FormData` with the single `file` part and calls `apiFetch(eventId, …)` (event-scoped token), 15 s timeout, no manual `Content-Type`. The 201 body is validated by `parsePhoto` (wrong shape → `ApiError(200, 'UNKNOWN_ERROR', …)`); unreadable 2xx bodies become `ApiError` via the existing `apiFetch` normalization (R2).
  - `useUploadPhotoMutation(eventId)` uses `retry: 0` (upload is not idempotent). Locked controls while pending make stale results unreachable by construction (R4).
  - Local preview uses a `URL.createObjectURL` revoked on success/change/remove/unmount; the ready image always uses the returned server `url` (R5).
- **Logic**:
  - `validation/photo.ts` holds `MAX_PHOTO_BYTES`, `ALLOWED_PHOTO_TYPES`, and `validatePhotoFile` (R3).
  - `getPhotoUploadFailure` in `lib/event.ts` is the pure error mapper (R6).
- **C2**: `PhotoUploadScreen` derives one of `no-access`, `not-found`, `closed`, `empty`, `previewing`, `uploading`, `ready`, or `failed` (see [data-model.md](data-model.md)).
  - Choosing a new file discards the held identity and uploads anew; [Remove] clears state without a request.
  - Failures map by code with server-message preference; uploading/ready/failure transitions are announced and failures move focus (R7). No secrets in logs (R8).

See [research.md](research.md) R1–R9, [data-model.md](data-model.md), and [contracts/ui-upload-photo.md](contracts/ui-upload-photo.md).

## Technical Context

**Language/Version**: TypeScript 6.0.x (strict), Node 24 LTS, pnpm 12

**Primary Dependencies**: Next.js 16.x (App Router), React 19.x, Astryx 0.7.4, TanStack Query 5, Zod 4. All are installed; no new dependencies.

**Storage**: Existing per-event `localStorage` record via `src/lib/session.ts` (read-only here for access gating). The held photo identity lives in C2 component state only; reopening C2 starts empty. No new persistent storage.

**Testing**: Vitest 5 + Testing Library (jsdom) and `renderWithClient`. Screen tests mock only `@/lib/api/client` (`apiFetch`) and keep the real API functions and hooks (R9). Unit tests mock `apiFetch` or `fetch`. No network. Manual checks at 360/430 px ([quickstart.md](quickstart.md)).

**Target Platform**: Mobile browsers (iOS Safari, Android Chrome), portrait 360–430 px

**Project Type**: Web application frontend (`frontend/`) consuming the existing backend, which is unchanged

**Performance Goals**: Local preview appears immediately on selection; the ready server-URL image replaces it as soon as the upload returns (SC-001).

**Constraints**:
- At most one upload in flight (`retry: 0`, controls busy while pending). Upload is not idempotent, so no blind retry of a lost response — the user explicitly taps [Try again] (R4).
- No upload is sent for locally detectable problems, for closed events, or without device-held access (SC-003).
- Ready is shown only after a validated successful (2xx) response (FR-005/FR-009). `apiFetch` does not expose the status code, so 201 is not checked specifically. No optimistic state.
- The token, headers, image bytes, and response bodies are never written to app logs (FR-012). Dev-server request logging is out of scope (R8).
- All UI copy is in English, and the copy is fixed in the [UI contract](contracts/ui-upload-photo.md).

**Scale/Scope**:
- 1 changed page, 1 new screen, 1 new small API module.
- 1 new validation module, 1 failure mapper, 1 response parser, 1 mutation hook (+ 1 mutation-key family), 1 new type.
- Plus tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-research assessment | Status |
|---|---|---|
| I. Exchange Integrity First | Server results drive every state: closed, auth, and scope come from the server/event query; ready requires a validated success; closed disables the step. The public-URL display and indefinite unattached retention are decided backend outcomes reused as-is. | PASS |
| II. Test-First | No application code is written during planning. | PASS |
| III. Test Scope by Risk | Plan targets unit tests for pure logic (validation, mappers, parsing) and screen tests for state transitions; layout verified manually. | PASS |
| IV. Isolated, Deterministic Tests | Plan targets mocked `apiFetch`, fresh `QueryClient` per test, no network. | PASS |
| V. Simplicity | No new dependencies; reuses `apiFetch`, session, event query, and error patterns; description/clothing POST stays out of scope. | PASS |

**Post-design re-check (after Phase 1)**: PASS.
- I: `parsePhoto` gating plus code-based failure mapping keep server results authoritative; overlapping requests are prevented by locked controls, never rendered.
- II: every behavior (including FormData wiring, local checks, single in-flight via locked controls, object-URL lifecycle, and logging) is tested Red before its implementation task; no behavior is first tested after its commit.
- III: validation/mapper/parser unit tests plus screen-transition tests match `testing.md`; no numeric coverage goal.
- IV: mock boundary at `apiFetch` only; no real network; deterministic object-URL handling via stubbed `URL.createObjectURL/revokeObjectURL` in tests.
- V: one screen, one API module, one validation module, one mapper; no store, no dropzone library, no clothing-form scope.

## Project Structure

### Documentation (this feature)

```text
specs/010-upload-photo-frontend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ui-upload-photo.md # Consumed API handling, route, C2 elements
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── app/events/[eventId]/(tabs)/my-items/new/page.tsx (+ .test.tsx) # server page → <PhotoUploadScreen eventId>
├── components/clothing/
│   └── PhotoUploadScreen.tsx (+ .test.tsx)      # NEW: C2 photo step
├── lib/
│   ├── event.ts (+ .test.ts)                   # + getPhotoUploadFailure
│   ├── validation/
│   │   └── photo.ts (+ .test.ts)                # NEW: MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES, validatePhotoFile
│   │   └── photo-response.ts (+ .test.ts)      # NEW: parsePhoto (decided: new file; event-response.ts is event-domain only)
│   └── api/
│       ├── photos.ts (+ .test.ts)               # NEW: uploadPhoto, useUploadPhotoMutation
│       └── query-keys.ts                        # + mutationKeys.uploadPhoto
└── types/photo.ts                               # NEW: Photo
```

`src/components/ui/ComingSoonScreen.tsx` stays in place only if other routes still use it; the `my-items/new` usage is removed.

**Structure Decision**: This is a frontend-only change inside `frontend/`. `backend/`, `routes.ts`, `session.ts`, and the shared event query/layout are not modified (read-only reuse).

## Delegation Notes (for `/speckit-implement`)

- The orchestrator doesn't edit `frontend/`. The type and the mutation key are boilerplate (`scaffolder` → `commit-reviewer`), or they are folded into the first cycle that uses them.
- Run cycles `test-author` → `implementer-fe` → `commit-reviewer` in dependency order:
  1. `validation/photo.ts`
  2. `parsePhoto` (+ `types/photo.ts`)
  3. `getPhotoUploadFailure`
  4. `uploadPhoto` + `useUploadPhotoMutation` (+ mutation key)
  5. `PhotoUploadScreen` empty → preview → uploading → ready handoff + page wiring (+ change/remove)
  6. upload failures (including the state resets they exercise)
  7. single in-flight (locked controls) + local-rejection context clearing + closed/no-access gating + log-scope test
- Give each delegate:
  - this plan, [research.md](research.md), [data-model.md](data-model.md), and [contracts/ui-upload-photo.md](contracts/ui-upload-photo.md)
  - `docs/plans/api/05-upload-photo.md` and `specs/009-upload-photo/contracts/upload-photo.openapi.yaml`
  - `docs/rules/dev/common/api-contract.md` and `docs/rules/dev/frontend/`
  - the checks `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
- Implementers follow `frontend/AGENTS.md`: Next 16 docs in `node_modules/next/dist/docs/`, Astryx component props via `pnpm exec astryx component <Name>`, no `<div>`/raw styling. `astryx doctor --built` must pass before the screen is delivered.

## Complexity Tracking

No constitution violations.
