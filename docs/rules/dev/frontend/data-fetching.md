# Data Fetching and Server State

The backend is a separate API server. Integrate only through the [shared API contract](../common/api-contract.md). Paths and request/response details remain undecided; align types/function names for now and confine later adjustments to `lib/api/`.

## 1. One API Client

- **MUST:** route all HTTP calls through `apiFetch` in `src/lib/api/client.ts`. **No** direct `fetch` in components/hooks.
- **MUST:** let `apiFetch` handle base URL, headers, session attachment (`lib/session.ts`), JSON parsing, and `ApiError` conversion per [error-handling.md](error-handling.md).
- **MUST:** follow shared JSON casing/dates. If casing conversion is needed, centralize it in `apiFetch`, never individually elsewhere.
- **MUST:** put domain requests in `lib/api/<domain>.ts` (`events.ts`, `items.ts`, `preferences.ts`, `intents.ts`, `trades.ts`, `suggestions.ts`).

```ts
// src/lib/api/client.ts
import { env } from '@/lib/env';
import { getSessionHeaders } from '@/lib/session';

import { toApiError } from './api-error';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...getSessionHeaders(),
      ...init.headers,
    },
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

```ts
// src/lib/api/trades.ts
import type { Trade } from '@/types/trade';

import { apiFetch } from './client';

export const getTrade = (eventId: string, tradeId: string) =>
  apiFetch<Trade>(`/events/${eventId}/trades/${tradeId}`);

export const consentTrade = (eventId: string, tradeId: string, version: number) =>
  apiFetch<Trade>(`/events/${eventId}/trades/${tradeId}/consent`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
```

> Paths above are examples. Align them after the shared API contract is finalized.

- **MUST:** upload photos using `FormData` without manually setting `Content-Type` (see `isFormData` above).

## 2. Types

- **MUST:** define response types in `src/types/<domain>.ts` and supply them as request function generics.
- **MUST:** represent server statuses (event, clothing, proposal, response) with literal unions.
- **MUST:** include server `version` in proposal types and return it unchanged in consent/rejection/alternative acceptance requests. **Never** calculate/increment versions on the frontend.
- **MUST NOT:** reproduce server decisions (availability, duplicate confirmation, cycles) on the frontend. Branch only on server states/flags.
- **SHOULD:** generate types from backend OpenAPI using `openapi-typescript` into `src/types/api.gen.ts`, replacing manual types. Do not edit generated files.

## 3. Server State: TanStack Query

- **MUST:** use TanStack Query v5 for server data. Do not add global stores such as Redux/Zustand.
- **MUST:** use `useState` or URL queries for client-only UI state (open modal, selected offered garment).
- **MUST:** define `QueryClientProvider` in `src/app/providers.tsx` (`'use client'`) and wrap it from root `layout.tsx`.
- **MUST:** generate query keys only through factories in `lib/api/query-keys.ts`. **No** hardcoded key strings.
- **MUST:** colocate query/mutation hooks in `lib/api/<domain>.ts` (`useTradeQuery`, `useConsentTradeMutation`).
- **MUST:** refresh related queries with `invalidateQueries` on mutation success. **No** optimistic updates for consent/confirmation/cancellation requiring server validation.

```ts
// src/lib/api/query-keys.ts
export const queryKeys = {
  event: (eventId: string) => ['events', eventId] as const,
  trades: (eventId: string) => ['events', eventId, 'trades'] as const,
  trade: (eventId: string, tradeId: string) => ['events', eventId, 'trades', tradeId] as const,
  homeSummary: (eventId: string) => ['events', eventId, 'home'] as const,
};
```

```ts
// QueryClient defaults
new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});
```

- **MUST:** disable mutation retries (`retry: 0`) and disable buttons while requests are pending to avoid duplicate consent.

## 4. Polling and Refresh

Live chat/push is out of scope. Reflect other participants' consent, invalidation, confirmation, and closure through **periodic queries**.

| Target | Screen | Interval |
|---|---|---|
| Proposal detail (pending consent) | T2 | 5 seconds |
| Home tasks/badges, exchange list | P2, T1 | 15 seconds |
| Event state (closure) | Entire event layout | 30 seconds |
| Confirmed/closed/invalidated proposals | T3, history | No polling |

- **MUST:** poll only with `refetchInterval`. **No** `setInterval` + `fetch`.
- **MUST:** avoid background polling (`refetchIntervalInBackground: false`, default). Refresh immediately on return with `refetchOnWindowFocus`.
- **MUST:** stop polling once state can no longer change.

```ts
export function useTradeQuery(eventId: string, tradeId: string) {
  return useQuery({
    queryKey: queryKeys.trade(eventId, tradeId),
    queryFn: () => getTrade(eventId, tradeId),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 5_000 : false),
  });
}
```

- **MUST:** if polling changes `version` or invalidates the proposal, disable consent and show "The proposal has changed" so users cannot consent to a version they have not reviewed.
- **MUST:** show a closed-event banner and disable registration/intent/consent/cancellation buttons when the event closes.
- **SHOULD:** invalidate proposal, exchange list, and home summary keys together after consent/acceptance/cancellation.

## 5. Environment Variables

- **MUST:** prefix browser values with `NEXT_PUBLIC_`. They are embedded at build time, so include **only public values**.
- **MUST NOT:** place secrets/API keys in frontend variables. Only the backend calls Meta Model API.
- **MUST:** read variables only in `src/lib/env.ts` and fail immediately if missing. **No** direct `process.env` elsewhere.
- **MUST:** commit every key in `.env.example` with empty/local default values. Do not commit `.env*.local`.

```ts
// src/lib/env.ts
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_BASE_URL is not set');

export const env = { apiBaseUrl } as const;
```

`NEXT_PUBLIC_*` uses static substitution; dynamic access such as `process.env[key]` does not work. Use literal keys as above.

| Key | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL | `http://localhost:8000` |
| `NEXT_PUBLIC_APP_URL` | Public frontend URL for QR/share links | `http://localhost:3000` |
