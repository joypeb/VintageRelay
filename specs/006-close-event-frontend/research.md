# Research: Close Event Frontend (Mobile)

All Technical Context items were resolvable from the existing frontend (features 002/004), the frontend rules, the installed libraries, and the Astryx catalog. No NEEDS CLARIFICATION remains. Decisions R1–R5 and R9–R10 were revised after `/speckit-analyze` (findings F01–F07, F09, F11, F12).

## R1. Request function and response validation

- **Decision**: Add `closeEvent(eventId)` in `src/lib/api/events.ts`: `apiFetch(eventId, '/events/{encoded id}/close', { method: 'POST' }, { timeoutMs: 15_000, timeoutMessage })`, then `parseEvent`. If the parsed event is not `status === 'closed'`, throw `ApiError(200, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.')` like other malformed responses.
- **Timestamp validation (F06)**: `eventSchema` (`src/lib/validation/event-response.ts`) requires `createdAt` and non-null `closedAt` to be parseable timestamps (`z.string().refine((s) => !Number.isNaN(Date.parse(s)))`). Without this, `closedAt: ''` passes and `formatDateTime` throws `RangeError` inside `EventClosedBanner`. This deliberately tightens the 004 read validation too; an unreadable timestamp becomes an unexpected response (`UNKNOWN_ERROR`).
- **Rationale**: Reuses the 004 schema (which already requires `closedAt` when closed and `stats` for the organizer). The extra closed-status check enforces FR-006.
- **Timeout message**: "The connection timed out. The event may already be closed; check again." — closure is idempotent, so retrying is safe and the reload after failure (R3) shows the real state.
- **Alternatives**: A separate close-response schema — rejected; the contract returns the same `Event`. `z.iso.datetime()` — rejected as stricter than needed; the display only needs `Date.parse` to succeed.
- **Note**: `apiFetch` sets `Content-Type: application/json` on a body-less POST; the contract marks the header as not required, so it is harmless and unchanged.

## R2. Mutation hook and one in-flight close per event (F04)

- **Decision**:
  - Add `mutationKeys.closeEvent(eventId)` → `['events', eventId, 'close']` to `src/lib/api/query-keys.ts` (keys only via factories, `data-fetching.md` §3).
  - `useCloseEventMutation(eventId)`: `mutationKey: mutationKeys.closeEvent(eventId)`, `retry: 0`.
  - `useIsCloseEventPending(eventId)`: `useIsMutating({ mutationKey: mutationKeys.closeEvent(eventId), exact: true }) > 0`.
  - M1 and H3 use `useIsCloseEventPending` (not the local observer's `isPending`) to disable [Close event] on M1 and in H3, so a remounted M1 cannot start a second POST while the first is in flight.
- **Rationale**: A button-local `isPending` belongs to one `MutationObserver`; leaving and reopening M1 creates a new observer while the original request continues, so two POSTs were reproducible. `useIsMutating` reads the shared `MutationCache`. A mutation key alone does not deduplicate; the disabled UI does.
- Hook-level `useMutation` options live on the mutation object, so `onSuccess`/`onSettled` still run if M1 unmounts mid-request.
- **Alternatives**: A module-level in-flight promise map — works but bypasses TanStack state and needs manual cleanup; rejected.

## R3. Cache update and stale-read protection (F03, F12)

- **Decision**:
  1. `onMutate`: `await queryClient.cancelQueries({ queryKey: queryKeys.event(eventId), exact: true })` so an in-flight poll cannot land after the closure result.
  2. `onSuccess(event)`: `await cancelQueries({ queryKey: queryKeys.event(eventId), exact: true })`, then `setQueryData(queryKeys.event(eventId), event)` with the server-returned closed event. Polling stops automatically (`eventRefetchInterval` returns `false` for closed).
  3. `onSettled`: `void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId), exact: true })` — **not awaited/returned**, so the mutation settles on the POST result and H3 is not held busy by the follow-up GET. Refreshes counts after success and reveals the real state after any failure.
  4. Defense in depth: `useEventQuery` gets `structuralSharing: keepClosedEvent`, a pure function that keeps the previous data when it is `closed` and the next is `active` (events cannot be reopened in v1, so that transition can only be a stale response), and otherwise returns `replaceEqualDeep(prev, next)` to keep TanStack's default referential sharing.
- **API shape**: In TanStack Query v5, `cancelQueries`/`invalidateQueries` take a **filter object**; passing a bare key array matches every query. `setQueryData` takes the key directly. `exact: true` keeps other `['events', id, …]` keys (future trades etc.) untouched.
- **Rationale**: `data-fetching.md` §3 forbids optimistic updates and requires invalidation on success; writing the **server's** response into the cache is not optimistic, and invalidation still follows. P2, M1, and the layout banner share the one query, so all update immediately (FR-005, SC-002).
- **Alternatives**: Invalidate only (no `setQueryData`) — leaves M1 active until the refetch returns and a slow poll could still race; rejected.

## R4. H3 dialog component (F07, F11)

- **Decision**: New `CloseEventDialog` built on Astryx `Dialog` (+ `DialogHeader` from `@astryxdesign/core/Dialog`), not `AlertDialog`.
- **Rationale**: `AlertDialog` takes `description: string` only and has no slot for an inline error, but FR-007 requires the error to stay inside H3 with retry. `Dialog` gives `role="dialog"`/`aria-modal`, focus trap and return, and Escape (`styling.md` accessibility rules). Composition mirrors AlertDialog's mobile layout: destructive [Close event] above [Cancel], both full width. `DialogHeader` focuses the title on open, so the destructive action is never focused by default; no close (×) button — [Cancel] is the dismiss action.
- **Dismissal**: `purpose="info"` (installed Astryx allows backdrop dismissal only for `info`; `form` never dismisses on backdrop), so Escape and backdrop tap close H3 when idle, matching `styling.md` §accessibility. `onOpenChange(false)` is ignored while a close is pending (FR-011).
- **Copy (F01)**: Title "Close this event?"; description "Closing ends the exchange corner for everyone. Participants can no longer register clothes or make exchanges. This can't be undone." Only settled effects are stated; proposal invalidation and record preservation remain approval-gated in `specs/005-close-event` FR-010/FR-011 and are not mentioned.
- **Error display**: `role="alert"` error Banner (same pattern as `EventScreenStatus`) inside the dialog. Cleared when the dialog is reopened (`mutation.reset()`).
- **Test environment**: jsdom lacks `HTMLDialogElement.showModal`/`close`/`requestClose`, and Astryx calls `showModal()` directly. A minimal shim in `src/test/dialog-polyfill.ts`, loaded from `vitest.setup.ts`, defines them only when missing (toggle `open`, dispatch `close`/`cancel`). Tests render the real Astryx `Dialog`; focus movement and native back are verified manually.
- **Alternatives**: `AlertDialog` with the error appended to `description` — not announced as a live change; rejected. Mocking `@astryxdesign/core/Dialog` in tests — would not exercise the real dismissal rules; rejected.

## R5. Failure mapping and closed-state precedence (F05)

- **Decision**: Pure `getCloseEventFailure(error)` in `src/lib/event.ts`:
  - `FORBIDDEN` → `forbidden` (M1 renders the existing "Only the organizer can manage this event." view)
  - `UNAUTHENTICATED` → `no-access` (existing `EventScreenStatus`)
  - `NOT_FOUND` → `not-found` (existing `EventScreenStatus`)
  - anything else (`NETWORK_ERROR`, `INTERNAL_ERROR`, `UNKNOWN_ERROR`, non-`ApiError`) → `{ kind: 'dialog', message }`
- **Precedence**: a server-confirmed closed event (from closure or any read) wins over a dialog-level failure. M1 renders H3 only when `isDialogOpen && !isClosed(event)`, and when the event becomes closed while the dialog is open or the mutation is in error, M1 closes the dialog and calls `mutation.reset()`. Covers the lost-response case (failure → `onSettled` reload returns closed) and a poll closing the event while H3 is open.
- **Rationale**: Mirrors `getEventScreenState` so M1 picks a screen-level view from either the read or the close result; keeps the mapping testable without rendering.
- **Note**: `EVENT_CLOSED` is never returned by close (idempotent 200); if it ever is, it falls into `dialog` and the reload shows the closed state, which then takes precedence.

## R6. "Event closed" confirmation

- **Decision**: Reuse M1's existing always-mounted `role="status"` / `aria-live="polite"` region (it currently holds the "coming soon" text) to show "Event closed" after success. No Astryx `Toast`.
- **Rationale**: `useToast` needs a `ToastViewport` the app does not have; adding global infrastructure for one message conflicts with Principle V. H2's "Link copied" uses the same live-region pattern.

## R7. Removing the "coming soon" placeholder

- **Decision**: Delete `showCloseNotice` state and its text from `ManageEventScreen`; [Close event] now opens H3. Remove the 004 test that asserted the notice.
- **Rationale**: FR-001. The test removal is a behavior change owned by this feature, not a skipped test.

## R8. Testing approach (F02, F08, F09)

- **Decision**: Red-first unit tests for timestamp validation, `closeEvent`, `useCloseEventMutation` cache effects (filter scope, cancel → set → invalidate, no set on failure, settles without waiting for the GET), `useIsCloseEventPending` across remount, `keepClosedEvent`, `getCloseEventFailure`, `CloseEventDialog` (real Astryx `Dialog` via the shim), and `ManageEventScreen`.
- **Integration requirement**: `ManageEventScreen` close-flow tests mock **only** `@/lib/api/client` (`apiFetch`) and use the real `useEventQuery`/`useCloseEventMutation` with one shared `QueryClient`, so mutation → cache → screen wiring is exercised. This needs `renderWithClient` to accept an optional caller-provided `QueryClient` and return it (test-infra change in `src/test/render.tsx`). Existing 004 tests that mock `useEventQuery` stay as they are.
- **Regression guards**: assertions over unchanged 004 behavior (organizer gating, token not rendered, P2 closed rendering) are labelled as regression guards and may pass on first run; every assertion about new behavior must be Red first.
- Manual 360/430 px checks, focus targets, native back, tap count, and timing in [quickstart.md](quickstart.md).

## R9. Focus after H3 closes

- **Decision**: Cancel/Escape/backdrop → Astryx returns focus to [Close event]. Success → [Close event] disappears; focus moves to the M1 heading "Manage event" (`tabIndex={-1}`), and "Event closed" is announced by the live region. Screen-level failure → focus moves to the replacement view's first text/heading. Precedence close (R5) → same as success.
- **Rationale**: Astryx only restores focus to its captured trigger; when that trigger unmounts, focus would fall to `body`. Verified manually (quickstart).

## R10. Test-infra ownership

- **Decision**: `src/test/dialog-polyfill.ts`, the `vitest.setup.ts` import, and the `renderWithClient` client option are test infrastructure with no product behavior, delivered by `scaffolder` → `commit-reviewer` before the cycles that need them. `vitest.setup.ts` sits outside both `test-author` and `implementer-fe` allowed paths, so this is an explicit `scaffolder` exception.
