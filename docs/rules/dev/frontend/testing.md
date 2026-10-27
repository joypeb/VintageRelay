# Testing

For this hackathon prototype, test **where failure would break the demo**. No coverage target.

## 1. Tools

| Purpose | Tools |
|---|---|
| Unit/component tests | Vitest + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`, `jsdom` environment |
| API mocking | `vi.mock` functions in `lib/api/<domain>.ts`; MSW if needed |
| E2E (optional) | Playwright with mobile viewport, e.g. `devices['iPhone 15']` |

```ts
// vitest.config.mts
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'], // import '@testing-library/jest-dom/vitest';
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

Vitest cannot render async server components. Extract logic into client components or pure functions for testing.

## 2. Required Tests

- **`lib/api/api-error.ts`:** shared error format parsing, malformed bodies, network failure normalization.
- **Pure functions:** status labels, dates, organizer detection, route generation (`routes`).
- **Proposal consent screen (T2) key branches:**
  - Clicking [Consent] while pending sends the current `version`.
  - A version conflict displays a change notice.
  - Invalidated/closed states disable consent.
- **Form schemas:** missing required values and excessive length.

## 3. Writing Tests

- **MUST:** query from the user's perspective: prefer `getByRole`, then `getByLabelText`, then `getByText`; `data-testid` is a last resort.
- **MUST:** interact through `userEvent`; avoid `fireEvent`.
- **MUST:** wrap query-hook components in `renderWithClient` (`src/test/render.tsx`) with a fresh `QueryClient` (`retry: false`) per test.
- **MUST NOT:** call real backend/Meta Model APIs. Unit tests run without networks.
- **MUST NOT:** test implementation details (internal state, classes) or use snapshots.
- **SHOULD:** describe behavior in English test names, e.g. `it('disables consent when the event is closed')`.

```tsx
it('shows a change notice on version conflict', async () => {
  vi.mocked(consentTrade).mockRejectedValue(new ApiError(409, 'PROPOSAL_VERSION_MISMATCH', 'Changed'));
  renderWithClient(<TradeDetailScreen eventId="e1" tradeId="t1" />);

  await userEvent.click(await screen.findByRole('button', { name: 'Consent' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('The proposal has changed');
});
```

Error codes are examples; use actual codes from the shared API contract.

## 4. E2E (Optional)

If time permits, automate only one or two demo scenarios with Playwright against a running backend.

1. Create event → second participant joins via code → both register clothing/intents → consent to two-person proposal → verify confirmation.
2. Verify consent is disabled after event closure.

## 5. Commands

- **MUST:** pass `pnpm test` before PRs.
- **SHOULD:** use `pnpm vitest` in watch mode during development.
