# Research: 019

Codebase research delegated to the `explorer` profile (2026-11-03); findings below with decisions.

## R1. Strict output schema (FR-001/FR-002)

- Finding: `AnalysisResult.size_label: str | None = None` made Pydantic omit it from `required`; Meta strict `json_schema` requires every property in `required` → 400 on every call.
- Decision: remove the default (`size_label: str | None`). A missing key now fails validation (retry, then `failed`), matching 018 FR-005 "missing keys count as failure". Regression test asserts `required == properties` for the root and every `$defs` entry.
- Alternatives: post-process the schema to force `required` (extra code, hides drift); turn `strict` off (loses structured-output guarantees).

## R2. Model info nulls (FR-003)

- Finding: backend `AnalysisModelInfo` fields default to `None` and are serialized as `null`, which the API contract requires ("include fields defined in the response schema even when absent, using null"). Frontend zod used `.optional()`.
- Decision: `.nullish()` for `latencyMs`, `promptTokens`, `completionTokens`; types `?: number | null`. Backend unchanged.

## R3. Withdrawal convergence (FR-004..006)

- Finding: `ClothingService.withdraw` (`backend/app/services/clothing.py:382-410`) runs one `db.write()` transaction: not found/other event → 404, non-owner → 403, already withdrawn → replay return, closed → 409, confirmed → 409, then sets `status = withdrawn`. `analysis_repo.mark_failed(s, clothing_id, content_version, now)` updates only `status = 'pending'` rows at that version.
- Decision: capture `now = self.clock()` once and call `analysis_repo.mark_failed(s, clothing.id, clothing.content_version, now)` right after setting `withdrawn`, in the same transaction. Replay and rejected paths return/raise before it, so FR-005 holds. The job's existing withdrawn check discards late results; `conditional_save` would also not overwrite because the job returns before saving (FR-006). The job test `test_withdrawn_garment_result_discarded` (`backend/tests/services/test_clothing_analysis_job.py:110-135`) must be checked: if it withdraws via the service and asserts `pending`, its expectation becomes `failed` (spec change, not a skipped test).
- Note (advisor): `conditional_save`'s predicate would allow overwriting `failed`; the job's transactional withdrawn check (`services/clothing_analysis.py:92-100`) is what prevents it — keep and test it with a gated in-flight fake. Already-withdrawn pending rows from before 019 converge via startup cleanup (replay stays side-effect free).
- Log: no new log line; `clothing_withdrawn` stays as is.
- Alternatives: frontend-only (hide/poll-stop for withdrawn) leaves a false `pending` row for every other client; marking in the job's discard path misses jobs that never run.

## R4. C1 row layout (FR-007..009)

- Finding: `MyItemsList.tsx:124-137` puts photo, title, badge, and `EstimatedByAI` in one horizontal `Stack` inside `ListItem.label`; Astryx `Badge` ellipsizes when squeezed; the analyzing text plus 58-char helper takes most of the row.
- Decision (revised after advisor A1): Astryx `ListItem` wraps only `label`/`description` in the link (`Item.tsx:742-808`), so moving photo/status into `startContent`/`endContent` would break whole-row navigation (`MyItemsList.test.tsx:106-109`). Keep the whole row as one link; inside it lay out photo | (title clamped to 2 lines over a second line with status + short "AI analyzing…") so the status label never competes with the helper. No helper sentence in rows. Status label uses Astryx `Token` (frontend/AGENTS.md: Badge = counts only), not `Badge`.

## R5. Tab bar position (FR-010)

- Finding: `(tabs)/layout.tsx:16-24` renders header, children, and `BottomTabBar` (`sticky bottom-0`) in a fragment with no full-height column, so on short pages the bar follows content.
- Decision: include the enclosing `frontend/src/app/events/[eventId]/layout.tsx` (closed-event banner is rendered before the tabs frame) and make the event frame a full-viewport-height column with the content area growing (`min-h-dvh` flex column, content `flex-1`), keeping `sticky bottom-0`. Use the Astryx layout component if one fits (implementer checks `astryx docs layout`), else token-backed Tailwind utilities.

## R6. C4 order, status, owner block (FR-011..013)

- Finding: `MyItemDetailScreen.tsx` renders status badge only for confirmed/withdrawn (`:182-183`), shows "Offered by" (`:191-193`), and places Edit/Delete after `EstimatedByAI` (`:207-225`).
- Decision: always render the status badge; drop the owner block in C4 (B3 keeps it); move the actions block (or confirmed lock note) above `EstimatedByAI`; withdrawn → no Edit/Delete (check current behavior and keep/enforce).

## R7. AI section (FR-014, FR-016)

- Finding: `EstimatedByAI.tsx:25-56` renders each color/tag as its own `Text` block; uncertainties are sibling `Text`s directly in `Banner` (`:73-82`) so they read as one paragraph. Helper copy at `:16` mentions registration.
- Decision: colors and style tags as wrapped inline `Token`/`Badge` chips (Astryx `Token`; frontend/AGENTS.md says Badge = counts only, so touched status/category labels in C1/C4 also move to `Token`); details keep a list; uncertainties as a semantic list (`ul/li` or Astryx `List`). Helper copy → "Analysis runs in the background." Shared with B3, so B3 tests may need updates.

## R8. Edit heading and delete dialog (FR-015, FR-017)

- Finding: edit form has no heading (`EditClothingForm.tsx:170-176`). Delete confirmation already uses Astryx `Dialog` + `DialogHeader` (native `<dialog>`, labelled by title per explorer); the live screenshot looked see-through.
- Decision: add `Heading level={1}` "Edit item". For the dialog, add a test asserting it is exposed as `role="dialog"` with the title as accessible name; if it passes already, the a11y half is done. For the surface, implementer compares with `CloseEventDialog` and inspects computed background at 390 px; fix through Dialog props/theme tokens only if transparent.

## R9. Verification gates (advisor A10)

- Run area checks before each commit; before PR also `pnpm build` (docs/rules/dev/common/git-workflow.md) and `pnpm exec astryx doctor --built <dir>` (frontend/AGENTS.md).
