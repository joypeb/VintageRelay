# Feature Specification: Clothing Category, Title, and Measurements

**Feature Branch**: `specs/013-clothing-category-measure`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "When registering clothing (011), require a predefined category and a title in addition to the description, and allow optional per-category body measurements in inches — tops: total length, chest, shoulder, sleeve; bottoms: total length, waist, hem, inseam, thigh. Define which categories are needed."

## Clarifications

### Session 2026-10-30

- Q: Category set for v1? → A: Four categories — `top`, `outer`, `bottom`, `other`. `outer` shares the tops measurement set; `other` (dresses, shoes, accessories) accepts no measurements in v1.
- Q: Is each measurement field individually optional when measurements are given? → A: Yes, partial input is allowed (only known dimensions need to be entered).
- Q: What happens when measurements are sent with category `other` or a field outside the category group? → A: Rejected with a validation error.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register a garment with category, title, and description (Priority: P1)

A participant in an active event registers a garment by choosing one predefined category, writing a title and a description, and attaching already-uploaded photos. The garment becomes available for exchange right away with the category and title shown wherever the garment appears.

**Why this priority**: Category and title are the minimum information needed to browse and distinguish garments; without them the list is a wall of photos and long descriptions.

**Independent Test**: As a joined participant of an active event, register a garment with a category, a title, a valid description, and uploaded photos, and confirm the returned garment carries the same category, trimmed title, and trimmed description.

**Acceptance Scenarios**:

1. **Given** an active event and uploaded photos not attached to any garment, **When** the caller registers with category `top`, title `Green denim jacket`, and a 1–1,000 character description, **Then** a new garment is created with status available, at content version 1, showing the given category and the trimmed title.
2. **Given** a successful registration, **When** the caller lists their own garments or opens the garment detail, **Then** the category and title appear exactly as registered.
3. **Given** a successful registration, **When** logs are inspected, **Then** exactly one clothing-registered record identifies the garment and event, and neither the title nor the description text appears in any log.

---

### User Story 2 - Add optional measurements fitting the category (Priority: P1)

A participant registering a `top`, `outer`, or `bottom` garment optionally enters the dimensions they know, in inches. The measurements are stored with the garment and shown on its detail so other participants can judge the fit before proposing an exchange.

**Why this priority**: Fit is the most common reason an in-person exchange fails; optional measurements capture it without blocking registration when the participant has no tape measure.

**Independent Test**: Register a `top` with only chest and sleeve entered, and a `bottom` with all five dimensions, and confirm both garments return exactly the entered values with unentered dimensions `null`.

**Acceptance Scenarios**:

1. **Given** a registration with category `top`, **When** the caller sends measurements with only `chest` and `sleeve` in inches, **Then** the garment is created and returns those two values with the remaining tops dimensions `null`.
2. **Given** a registration with category `bottom`, **When** the caller sends all five bottoms dimensions, **Then** all five values are stored and returned.
3. **Given** a registration with category `outer`, **When** the caller sends `totalLength`, `chest`, `shoulder`, or `sleeve`, **Then** the values are accepted like a `top`.
4. **Given** a registration without measurements, **When** the garment is created, **Then** it carries no measurements and is still available for exchange.

---

### User Story 3 - Invalid category, title, or measurement input is rejected safely (Priority: P1)

Registrations with a missing or unknown category, a missing or overlong title, measurements that do not belong to the chosen category, or non-numeric/out-of-range dimensions are rejected with a clear reason and leave no garment behind.

**Why this priority**: Bad category or measurement data would corrupt browsing, fit judgments, and every later matching step.

**Independent Test**: Attempt registrations with each invalid combination below and verify the matching error and that no garment was created.

**Acceptance Scenarios**:

1. **Given** a registration missing the category or the title, **When** it is submitted, **Then** a validation error is returned and no garment is created.
2. **Given** a registration with a category outside `top`, `outer`, `bottom`, `other`, **When** it is submitted, **Then** a validation error is returned and no garment is created.
3. **Given** a registration with category `bottom` carrying a `sleeve` value, or category `top` carrying a `waist` value, **When** it is submitted, **Then** a validation error is returned and no garment is created.
4. **Given** a registration with category `other` carrying any measurements, **When** it is submitted, **Then** a validation error is returned and no garment is created.
5. **Given** a title of only whitespace or longer than 100 characters, **When** it is submitted, **Then** a validation error is returned and no garment is created.
6. **Given** a measurement value that is not a number or is outside 0–120 inches, **When** it is submitted, **Then** a validation error is returned and no garment is created.

---

### User Story 4 - Browse and open garments showing category, title, and measurements (Priority: P2)

A participant browsing the event garment list or opening one garment's detail sees its category, title, and measurements (when given) alongside the existing photo, description, and status.

**Why this priority**: The new fields only create value if they are visible where participants choose garments.

**Independent Test**: Seed garments in several categories with and without measurements, then list and open details and verify the new fields.

**Acceptance Scenarios**:

1. **Given** garments with categories, titles, and measurements in the caller's event, **When** the caller lists garments, **Then** each item shows its category, title, and measurements.
2. **Given** a garment with measurements, **When** the caller opens its detail, **Then** the exact entered values are shown.
3. **Given** a garment registered without measurements, **When** the caller opens its detail, **Then** it shows no measurements rather than zeros.

### Edge Cases

- A title of exactly 1 character or exactly 100 characters is accepted; 0 or 101 characters is rejected.
- A title containing only whitespace is treated as missing and rejected.
- A title containing control characters (including newline) is rejected.
- A description of exactly 1 or 1,000 characters is still accepted (011 rule unchanged).
- A measurement value of exactly 120 inches is accepted; 0, negative, or above 120 is rejected.
- Measurements sent as `{}` (empty object) are treated the same as no measurements.
- Unknown extra fields anywhere in the registration (including inside measurements) are rejected.
- The existing 011 rules are unchanged: event scope, photo ownership and single-attachment, closed-event rejection, validation-before-auth check order, and identical not-found bodies.
- Reads remain allowed after the event is closed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST require exactly one category per garment, and the category MUST be one of `top`, `outer`, `bottom`, `other`. Any other value MUST produce a validation error. Verified by User Story 3, scenarios 1–2.
- **FR-002**: The system MUST require a title of 1–100 characters after trimming leading and trailing whitespace, and MUST store the trimmed text; a missing, whitespace-only, or over-100-character title MUST produce a validation error; titles containing control characters (including newlines, which would break single-line list rows) MUST be rejected. Verified by User Story 1, scenario 1 and User Story 3, scenario 5.
- **FR-003**: The description rule from 011 MUST stay unchanged (required, 1–1,000 characters after trimming, stored trimmed). Verified by User Story 1, scenario 1.
- **FR-004**: Measurements MUST be optional; an omitted or null measurements object means the garment has no measurements. Verified by User Story 2, scenario 4.
- **FR-005**: For categories `top` and `outer`, only `totalLength`, `chest`, `shoulder`, and `sleeve` MAY be present; for `bottom`, only `totalLength`, `waist`, `hem`, `inseam`, and `thigh` MAY be present. Any other field for the category MUST produce a validation error. Verified by User Story 2, scenarios 1–3 and User Story 3, scenario 3.
- **FR-006**: For category `other`, no measurements MAY be present; any measurements object with one or more fields MUST produce a validation error. An empty object `{}` is treated as no measurements. Verified by User Story 3, scenario 4.
- **FR-007**: Every provided measurement value MUST be a number greater than 0 and at most 120 (inches); each field is individually optional so partial input is allowed. Violations MUST produce a validation error. Verified by User Story 2, scenarios 1–2 and User Story 3, scenario 6.
- **FR-008**: Unknown fields anywhere in the registration request, including inside measurements, MUST produce a validation error. Verified by the edge cases.
- **FR-009**: Every returned garment (registration response, list item, detail) MUST include its category, title, and measurements (values as entered, unentered dimensions `null`, no measurements shown as `null` rather than zeros). Verified by User Story 1, scenario 2 and User Story 4, scenarios 1–3.
- **FR-010**: A successful registration MUST record one clothing-registered log entry identifying the garment and event; neither the title nor the description text MUST ever appear in logs. Verified by User Story 1, scenario 3.
- **FR-011**: Validation errors MUST use the shared validation-error shape with per-field reasons, and the existing check order (body validation → credential → event/resource scope → event state) MUST stay unchanged. Verified by User Story 3.
- **FR-012**: Status, content version, analysis, visibility, and closed-event read rules from 011 MUST stay unchanged; a new garment starts as available at content version 1 with no analysis. Verified by User Story 1, scenario 1.

### Key Entities

- **Clothing** (extended from 011): A registered garment with, in addition to photo(s), description, status, and version, a required category, a required owner-written title, and optional measurements.
- **Clothing Category**: One of `top` (shirts, tees, knits), `outer` (jackets, coats — measured like tops), `bottom` (pants, skirts), `other` (dresses, shoes, accessories — no measurements in v1).
- **Measurements**: Optional per-garment dimensions in inches. Tops group (`top`, `outer`): total length, chest, shoulder, sleeve. Bottoms (`bottom`): total length, waist, hem, inseam, thigh. Each dimension individually optional.
- **Participant / Event / Photo**: Unchanged from 011; photo attachment rules follow 011 as amended by the multi-photo feature (012).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of valid registrations, the garment is created as available with the exact category, trimmed title, and entered measurements, and it immediately appears with those fields in the owner's list and in other participants' lists.
- **SC-002**: In 100% of invalid category, title, or measurement attempts, the matching validation error is returned and zero garments are created.
- **SC-003**: In 100% of reads, garments registered with measurements return exactly the entered values, and garments registered without measurements show none (never zeros).
- **SC-004**: Zero garment titles and zero garment descriptions appear in logs in 100% of inspected registration cases.

## Assumptions

- Base is 011 as amended by the multi-photo feature (012): the photo part of the registration (one photo vs. a 1–10 photo list) follows 012, and this feature only adds category, title, and measurements around it.
- Title length counts characters, not bytes; the 100-character limit and the greater-than-0-to-120 inch range are defaults chosen for this spec and need agreement in planning if they do not fit.
- `outer` shares the tops measurement set because jackets and coats have the same four dimensions; dresses are assigned to `other` (no measurements) for v1 because a dress-specific set was not requested — a dress measurement set is a follow-up, not part of this feature.
- Units are inches only; no unit conversion or cm input in v1.
- Garment list filtering by category is out of scope; categories are shown but not filterable in this feature.
- Backend scope: this feature delivers the stored fields and their API behavior. Registration, list, and detail screens showing the new fields belong to later frontend work (the C2 photo-step work in 012 covers photos only).
- The compact garment form embedded in intents, proposals, and recommendations gains at least title and category; the exact shape is settled in planning.
- Sources are 011 (`specs/011-register-read-clothing/spec.md`), `docs/plans/api/06-register-read-clothing.md`, the shared API contract, and the database design.
