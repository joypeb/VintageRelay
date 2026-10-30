# Contract delta: clothing category, title, measurements (amends 011 + 012)

Only the changes are listed. Everything else — auth order, check order
(422 → 401 → 404 → 409), `photoIds` rules, error envelope, list filters, visibility,
`photos[]` shape — is unchanged from 011 (`register-read-clothing.openapi.yaml`)
as amended by 012 (`register-clothing-photos.md`).

## `POST /api/v1/events/{eventId}/clothing` — `registerClothing`

Request (`additionalProperties: false`):

```json
{
  "photoIds": ["e4f5a6b7-..."],
  "category": "top",
  "title": "Green denim jacket",
  "description": "Cropped, size M. Worn a few times.",
  "measurements": { "totalLength": 26.5, "chest": 21.0 }
}
```

| Field | Type | Rule |
|-------|------|------|
| `category` | string | Required. Enum `top\|outer\|bottom\|other`. |
| `title` | string | Required. `minLength: 1`, `maxLength: 100`. Trimmed before validation; control characters rejected. |
| `description` | string | Unchanged (1–1000, trimmed). |
| `measurements` | object \| null | Optional. `additionalProperties: false`. All 8 fields optional numbers (`exclusiveMinimum: 0`, `maximum: 120`, inches): `totalLength`, `chest`, `shoulder`, `sleeve`, `waist`, `hem`, `inseam`, `thigh`. `{}` equals absent. Allowed keys depend on category: `top`/`outer` → `totalLength, chest, shoulder, sleeve`; `bottom` → `totalLength, waist, hem, inseam, thigh`; `other` → no keys. |

New `details.fields` entries (all `422 VALIDATION_ERROR`, standard envelope):

| `field` | `reason` | When |
|---------|----------|------|
| `category` | `required` | Missing. |
| `category` | `invalid` | Value outside the enum. |
| `title` | `required` | Missing or whitespace-only (trimmed empty). |
| `title` | `too_long` | Over 100 characters after trim. |
| `title` | `invalid_characters` | Control characters present. |
| `measurements` | `invalid` | Any keys present with `category: other`. |
| `measurements.<name>` | `invalid` | Known field outside the category group (e.g. `measurements.sleeve` on `bottom`), or value `<= 0` / `> 120` / non-numeric. |
| `measurements.<name>` | `unknown_field` | Structurally unknown key (existing `extra="forbid"` behavior). |

## `Clothing` object (register, list, get responses)

Added fields:

```json
{
  "category": "top",
  "title": "Green denim jacket",
  "measurements": { "totalLength": 26.5, "chest": 21.0, "shoulder": null, "sleeve": null, "waist": null, "hem": null, "inseam": null, "thigh": null }
}
```

- `category`: enum `top|outer|bottom|other`.
- `title`: trimmed string.
- `measurements`: object with all 8 fields (number or null), or `null` when none were given.
- The compact garment form embedded in later intent/proposal features gains `title` and
  `category` (docs only; no operation in this feature returns it).

## Logging

`clothing_registered` extras gain `title_length` and `category`. Title and description text
never appear in logs.
