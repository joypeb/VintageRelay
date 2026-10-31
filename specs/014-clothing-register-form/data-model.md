# Data Model: Photo Carousel and Clothing Details Form (C2)

Frontend-only. No server, storage, or API shape changes. All state lives in the browser while the participant stays on C2.

## Held photo queue (unchanged, from 012)

`C2State = { step: 1 | 2, items: PhotoItem[], lastSkipped: number }` in `frontend/src/lib/photo/queue.ts`. Item states: waiting → preparing → uploading → ready | failed. This feature only changes how items are rendered (carousel slides) and adds a reset after successful registration (the screen leaves C2, so unmounting is enough; no reducer action needed).

## Carousel position (new, component state)

| Field | Type | Rule |
|---|---|---|
| `index` | number | `0 … items.length-1`; derived from scroll: `round(scrollLeft / clientWidth)`, clamped |
| `targetIndex` | number \| null | set while an arrow animation runs; next arrow click steps from it |

Pure helpers (`frontend/src/lib/photo/carousel.ts`):

- `indexFromScroll(scrollLeft, slideWidth, count) → number` — clamped, `0` when `count` or `slideWidth` is 0.
- `linearScrollAt(from, to, elapsedMs, durationMs) → number` — `from + (to-from) * min(elapsed/duration, 1)`.
- `nextTarget(index, targetIndex, dir, count) → number` — `clamp((targetIndex ?? index) + dir, 0, count-1)`; `dir` is `-1 | 1`.
- `SLIDE_DURATION_MS = 300`.

## Clothing details draft (new, `PhotoUploadScreen` state)

| Field | Type | Rule (on [Register]) |
|---|---|---|
| `title` | string | trimmed length 1–100 code points; no control characters (incl. newline) |
| `description` | string | trimmed length 1–1,000 code points |
| `category` | `'top' \| 'outer' \| 'bottom' \| 'other' \| ''` | required (not `''`) |
| `measurements` | `Partial<Record<MeasurementField, string>>` | raw input strings; each empty or `^\d{1,3}(\.\d)?$` with `0 < value <= 120` |

Length is counted in Unicode code points (`Array.from(s).length`), the server's rule; counters show the same count of the untrimmed value (e.g. "12 / 100").

`MeasurementField = 'totalLength' | 'chest' | 'shoulder' | 'sleeve' | 'waist' | 'hem' | 'inseam' | 'thigh'`.

Category → fields (`measurementFieldsFor`):

| Category | Label | Fields (order shown) |
|---|---|---|
| `top` | Top | totalLength, chest, shoulder, sleeve |
| `outer` | Outer | totalLength, chest, shoulder, sleeve |
| `bottom` | Bottom | totalLength, waist, hem, inseam, thigh |
| `other` | Other | none |
| `''` | — | none ("Choose a category first.") |

Category change: `pruneMeasurements(newCategory, measurements)` keeps only keys valid for the new category (so `totalLength` survives top ↔ bottom).

Field labels: Total length, Chest, Shoulder, Sleeve, Waist, Hem, Inseam, Thigh — each suffixed "(in)".

## Field errors (new)

`ClothingFieldErrors = Partial<Record<'title' | 'description' | 'category' | MeasurementField | 'form', string>>`.

| Source | Message |
|---|---|
| title empty/whitespace | "Enter a title." |
| title > 100 | "Use 100 characters or fewer." |
| title control chars | "Use a single line without special characters." |
| description empty | "Enter a description." |
| description > 1,000 | "Use 1,000 characters or fewer." |
| category missing | "Choose a category." |
| measurement invalid | "Enter a number from 0.1 to 120." |
| server `VALIDATION_ERROR` field not mapped | `form`: "Check your entries and try again." |

## Server field errors (new, `mapClothingServerFieldErrors`)

Input: `ApiError.details` (unknown). Parsed as `{ fields: [{ field: string, reason: string }] }`; parse failure → `form`.

| field | reason | Target → message |
|---|---|---|
| `title` | `required` | title → "Enter a title." |
| `title` | `too_long` | title → "Use 100 characters or fewer." |
| `title` | `invalid_characters` | title → "Use a single line without special characters." |
| `description` | `required` | description → "Enter a description." |
| `description` | `too_long` | description → "Use 1,000 characters or fewer." |
| `category` | `required`, `invalid` | category → "Choose a category." |
| `measurements.<f>` (f in MeasurementField) | `invalid` | `<f>` → "Enter a number from 0.1 to 120." |
| `photoIds` | any | photo-problem state |
| anything else (incl. `measurements`, `measurements.<f>` + `unknown_field`) | any | form → "Check your entries and try again." |

Returns `{ fieldErrors, formError: string | null, photoProblem: boolean }`; first message per field wins.

## Register outcome state (new, `PhotoUploadScreen` state)

`registerOutcome: 'idle' | 'photoProblem' | 'notAvailable' | 'maybeRegistered' | 'networkError'` plus `hadUncertainAttempt: boolean` (set when an attempt ends in `NETWORK_ERROR`/unknown). Rules in research R9 and `contracts/c2-ui.md`.

## Register request (existing contract, built here)

`buildRegisterClothingBody(draft, photoIds)` →

```json
{
  "photoIds": ["<ready photo ids in queue order>"],
  "category": "top",
  "title": "<trimmed>",
  "description": "<trimmed>",
  "measurements": { "chest": 21.5, "sleeve": 24 }
}
```

`measurements` is omitted when no value is entered; only entered fields are included, as numbers. Response is the 013 `Clothing` object; only `id` is used (success signal), validated with a minimal Zod schema.
