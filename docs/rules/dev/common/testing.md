# Testing Principles

For this hackathon prototype, automate tests **where failure would be critical**. See backend/frontend documents for tools and commands.

## 1. Required Tests

Exchange rule violations could send real users' garments to the wrong people. Backend automated tests are **required** for:

- Two-person swap/three-person cycle detection, both positive and negative cases.
- Alternative garment detection and revalidation on acceptance.
- Prevention of duplicate garment confirmation, including concurrent requests.
- Rejection of consent to an old proposal version.
- Making related garments reusable after cancellation of a confirmed exchange.
- Rejection of registration, intents, consent, confirmation, and cancellation after event closure.
- Permissions: reject editing another's garments, consenting for another participant, and closing events as a non-organizer.

## 2. Recommendations

- **SHOULD:** add a few API tests for error formats (`error.code`, etc.) and key response fields.
- **SHOULD:** unit-test frontend logic only when complex pure logic appears (state transformations, validation); check screens manually.
- **SHOULD:** manually verify the end-to-end flow on a phone before deployment (create event → join → register clothing → proposal → consent → cancel/close).

## 3. Writing Tests

- **MUST:** run without external services; replace model APIs with mocks/fakes.
- **MUST:** isolate test data with a fresh SQLite DB per test (memory or temporary file).
- **MUST:** add a reproducing test before fixing bugs where possible.
- **MUST:** use descriptive names, e.g. `test_confirm_rejects_clothing_already_confirmed`.
- **MUST NOT:** delete/skip failing tests to pass a PR. If genuinely deferred, leave a reason and `TODO`.
- **MUST NOT:** commit actual API keys, real photos, or personal data as fixtures.
- **SHOULD:** reuse readable domain examples (white pants, green jacket, black hoodie).
- **SHOULD:** use section 1 as the criterion rather than a numeric coverage target.

## 4. Manual Verification

- **MUST:** verify screen changes at mobile widths of 360–430px and attach screenshots to the PR.
- **SHOULD:** evaluate AI recommendation quality manually against agreed cases and manual selection; record results ([initial plan](../../../plans/vintage-relay-plan-v1.md), section 8).
