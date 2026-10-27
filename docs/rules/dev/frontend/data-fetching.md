# 데이터 조회와 서버 상태

백엔드는 별도 API 서버다. 프론트는 공통 API 계약([../common/api-contract.md](../common/api-contract.md))만 보고 연동한다. API 경로와 요청·응답 상세는 아직 미정이므로 확정되기 전까지 타입과 함수 이름만 맞춰 두고, 확정되면 `lib/api/` 안에서만 수정한다.

## 1. API 클라이언트 단일화

- **반드시:** 모든 HTTP 요청은 `src/lib/api/client.ts` 의 `apiFetch` 를 거친다. 컴포넌트·훅에서 `fetch` 직접 호출은 **금지**.
- **반드시:** `apiFetch` 가 기본 URL, 공통 헤더, 세션 정보 첨부(`lib/session.ts` 사용), JSON 파싱, 에러 변환(`ApiError`)을 전담한다. 에러 변환은 [error-handling.md](error-handling.md)를 따른다.
- **반드시:** 응답 JSON 필드 케이스와 날짜 형식은 공통 API 계약을 따른다. 케이스 변환이 필요하면 `apiFetch` 한 곳에서만 처리하고 다른 곳에서 개별 변환하지 않는다.
- **반드시:** 도메인별 요청 함수는 `lib/api/<domain>.ts` 에 둔다(`events.ts`, `items.ts`, `preferences.ts`, `intents.ts`, `trades.ts`, `suggestions.ts`).

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

> 위 경로는 예시다. 실제 경로는 공통 API 계약 확정 후 맞춘다.

- **반드시:** 사진 업로드는 `FormData` 로 보내고 `Content-Type` 을 직접 지정하지 않는다(위 `isFormData` 처리).

## 2. 타입 정의

- **반드시:** API 응답 타입은 `src/types/<domain>.ts` 에 정의하고 요청 함수의 제네릭으로 지정한다.
- **반드시:** 서버가 주는 상태 값(행사 상태, 의류 상태, 교환안 상태, 응답 상태)은 리터럴 유니온 타입으로 정의한다.
- **반드시:** 교환안 타입에는 서버가 주는 `version` 을 포함하고 동의·거절·대체 제안 수락 요청에 그대로 돌려보낸다. 프론트에서 버전을 계산하거나 증가시키는 것은 **금지**.
- **금지:** 서버 판단을 프론트에서 재현하는 로직(교환 가능 여부, 중복 확정 판단, 순환 계산). 화면은 서버가 준 상태와 플래그로만 분기한다.
- **권장:** 백엔드가 OpenAPI 스키마를 제공하면 `openapi-typescript` 로 타입을 생성해 `src/types/api.gen.ts` 에 두고 수동 타입을 대체한다. 생성 파일은 직접 수정하지 않는다.

## 3. 서버 상태 관리: TanStack Query

- **반드시:** 서버 데이터는 TanStack Query v5로 관리한다. 별도 전역 상태 라이브러리(Redux, Zustand 등)는 도입하지 않는다.
- **반드시:** 클라이언트 전용 UI 상태(모달 열림, 선택한 제공 의류)는 `useState` 또는 URL 쿼리 파라미터로 관리한다.
- **반드시:** `QueryClientProvider` 는 `src/app/providers.tsx`(`'use client'`)에 두고 루트 `layout.tsx` 에서 감싼다.
- **반드시:** 쿼리 키는 `lib/api/query-keys.ts` 의 팩토리로만 만든다. 키 문자열 하드코딩 **금지**.
- **반드시:** 쿼리 훅·뮤테이션 훅은 `lib/api/<domain>.ts` 에 함께 둔다(`useTradeQuery`, `useConsentTradeMutation`).
- **반드시:** 뮤테이션 성공 시 관련 쿼리를 `invalidateQueries` 로 갱신한다. 낙관적 업데이트는 동의·확정·취소처럼 서버 검사가 필요한 동작에 **금지**한다.

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
// QueryClient 기본값
new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});
```

- **반드시:** 뮤테이션은 재시도하지 않는다(`retry: 0`). 동의 요청이 중복 전송되지 않도록 진행 중에는 버튼을 `disabled` 로 만든다.

## 4. 폴링과 갱신 전략

실시간 채팅·푸시는 범위 밖이다. 다른 참가자의 동의·무효화·확정·행사 종료는 **주기적 조회**로 반영한다.

| 대상 | 화면 | 간격 |
|---|---|---|
| 교환안 상세 (동의 대기) | T2 | 5초 |
| 홈 할 일·배지, 교환 목록 | P2, T1 | 15초 |
| 행사 상태(종료 여부) | 행사 레이아웃 전체 | 30초 |
| 확정·종료·무효 교환안 | T3, 지난 내역 | 폴링 안 함 |

- **반드시:** 폴링은 `refetchInterval` 로만 구현한다. `setInterval` + `fetch` **금지**.
- **반드시:** 백그라운드 탭에서는 폴링하지 않는다(`refetchIntervalInBackground: false`, 기본값 유지). 포커스 복귀 시 `refetchOnWindowFocus` 로 즉시 갱신한다.
- **반드시:** 더 이상 바뀌지 않는 상태가 되면 폴링을 멈춘다.

```ts
export function useTradeQuery(eventId: string, tradeId: string) {
  return useQuery({
    queryKey: queryKeys.trade(eventId, tradeId),
    queryFn: () => getTrade(eventId, tradeId),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 5_000 : false),
  });
}
```

- **반드시:** 폴링 결과 교환안의 `version` 이 바뀌었거나 상태가 무효로 바뀌면 동의 버튼을 비활성화하고 "교환안이 변경되었어요" 안내를 표시한다(사용자가 보던 내용과 다른 버전에 동의하지 않게 한다).
- **반드시:** 행사 상태가 종료로 바뀌면 행사 레이아웃의 종료 배너를 띄우고 등록·의향·동의·취소 버튼을 모두 비활성화한다.
- **권장:** 동의·수락·취소 뮤테이션 성공 후에는 해당 교환안, 교환 목록, 홈 요약 키를 함께 무효화한다.

## 5. 환경변수

- **반드시:** 브라우저에서 읽는 값은 `NEXT_PUBLIC_` 접두사를 붙인다. 이 값은 빌드 시 번들에 박히므로 **공개되어도 되는 값만** 넣는다.
- **금지:** API 키·비밀값을 프론트 환경변수에 넣는 것. Meta Model API 호출은 백엔드 서버만 한다.
- **반드시:** 환경변수는 `src/lib/env.ts` 에서만 읽고 누락 시 즉시 에러를 던진다. 다른 파일에서 `process.env` 직접 접근 **금지**.
- **반드시:** `.env.example` 에 모든 키를 값 없이(또는 로컬 기본값으로) 커밋하고 `.env*.local` 은 커밋하지 않는다.

```ts
// src/lib/env.ts
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_API_BASE_URL is not set');

export const env = { apiBaseUrl } as const;
```

`NEXT_PUBLIC_*` 는 정적 치환되므로 `process.env[key]` 같은 동적 접근은 동작하지 않는다. 위처럼 키를 문자 그대로 적는다.

| 키 | 용도 | 예 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 백엔드 API 기본 URL | `http://localhost:8000` |
| `NEXT_PUBLIC_APP_URL` | QR·공유 링크 생성용 프론트 공개 URL | `http://localhost:3000` |
