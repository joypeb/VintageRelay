# C2 UI Contract (amends 012 `contracts/c2-photo-step.md`)

## Step 1 — Photos

Order top to bottom:

1. Heading "Register clothing", "Step 1 of 2: Photos" (unchanged)
2. File picker help / alert / live status (unchanged)
3. Photo count and status notices (unchanged)
4. **Photo carousel** (replaces the vertical list)
   - Region `aria-label="Photo carousel"` (not "Clothing photos", which already names the file input), `aria-roledescription="carousel"`.
   - One slide per held photo, all mounted, each `aria-label="Photo N of M"`.
   - Slide frame: full carousel width, `aspect-ratio: 3/4`, clip overflow; image fills height, centered (research R4).
   - Image wrapped in a button `aria-label="View full photo N"` when a displayable image exists → opens Lightbox (R5).
   - Per-slide status (Waiting / Preparing photo… / Uploading… / failed message / could-not-display message) and actions ([Try again], [Remove]) directly under the frame, same lock rules as 012 FR-018.
   - Position text "N / M" when M ≥ 2.
   - Arrows `IconButton` "Previous photo" (`chevronLeft`) / "Next photo" (`chevronRight`) on the left/right edges, vertically centered on the frame; visible only under `(pointer: fine)` and when M ≥ 2; disabled at first/last slide.
5. [Add photo] (while < 10 held) and [Next] (unchanged gating).

Closed-event view: same carousel (slides, position text, arrows, overlay) but read-only — no [Remove], [Try again], [Add photo], [Next].

Behavior:

- Swipe: native scroll with x-mandatory snap.
- Arrow: animate `scrollLeft` linearly to `target * slideWidth` over 300 ms (snap off during animation); reduced motion → jump. One animation at a time; lifecycle (cancel on new click/user scroll/unmount, snap restored on every exit, resize keeps index) per research R3.
- Add: scroll to the last slide after it mounts.
- Lightbox: single image (`url` if ready, else `previewUrl`, snapshotted on open), Astryx close button "Close", Escape, backdrop click; focus returns to the slide button.

## Step 2 — Details

No images. Order top to bottom:

1. Heading "Register clothing", "Step 2 of 2: Details"
2. **Title** — Astryx `TextInput` (no `maxLength`/`inputMode` props exist), counter text "N / 100" rendered by us (code points)
3. **Description** — Astryx `TextArea` without its `maxLength`/built-in counter, counter text "N / 1,000" rendered by us (code points)
4. **Category** — Astryx `Selector` with options Top / Outer / Bottom / Other; placeholder "Choose a category"
5. **Measurements (optional, inches)** — Astryx `TextInput` per category field (data-model table); note "Choose a category first." (none) or "No measurements needed for this category." (Other)
6. General error / status area (`role="alert"`)
7. [Register] (primary, busy "Registering…" while pending) and [Back] (secondary, disabled while pending)

## Register outcomes

| Result | UI |
|---|---|
| Client validation fails | per-field messages, no request, focus first invalid field |
| 201 | `router.replace('/events/{id}?registered=1')`; home shows status "Clothing registered." only for `registered === '1'` |
| 422 `VALIDATION_ERROR` | `mapClothingServerFieldErrors` (data-model): field messages / "Check your entries and try again." / `photoIds` → photo problem |
| 409 `PHOTO_ALREADY_ATTACHED`, no earlier uncertain attempt | photo problem: "Some photos can no longer be used. Add your photos again." + [Back to photos] |
| 409 `PHOTO_ALREADY_ATTACHED` after an earlier `NETWORK_ERROR` attempt | maybe registered: "Your clothing may already be registered, so it was not sent again." + [Go to event home] |
| 404 `NOT_FOUND` | not available: "This event or some photos are no longer available." + [Back to photos] + [Go to event home] |
| 409 `EVENT_CLOSED`, 401 `UNAUTHENTICATED` | existing C2 closed / session handling |
| `NETWORK_ERROR` (incl. 15 s timeout) / other | existing `error-messages.ts` message + [Try again] (same body); marks an uncertain attempt |

All failures keep the draft and the held photos.

## API call (existing endpoint, new client)

`POST /api/v1/events/{eventId}/clothing` — body and response per `specs/013-clothing-category-measure/contracts/clothing-category-measure.md`; error envelope per `docs/rules/dev/common/api-contract.md`. No contract change.
