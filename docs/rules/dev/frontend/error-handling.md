# 에러 처리

## 1. API 에러 파싱

서버 에러 응답 형식은 공통 API 계약([../common/api-contract.md](../common/api-contract.md))을 따른다.

```json
{ "error": { "code": "PROPOSAL_VERSION_MISMATCH", "message": "교환안이 변경되었습니다.", "details": null, "requestId": "b7e2..." } }
```

- **권장:** 사용자 문의·버그 제보에 쓰도록 `requestId`를 `ApiError`에 보관하고 에러 로그에 함께 남긴다(화면에는 표시하지 않는다).

- **반드시:** `apiFetch` 는 실패 응답을 모두 `ApiError` 로 바꿔 던진다. 화면 코드는 `Response` 나 원본 JSON을 다루지 않는다.
- **반드시:** 본문이 형식에 맞지 않거나(HTML 502 페이지 등) 네트워크 자체가 실패한 경우도 `ApiError` 로 정규화한다.
- **반드시:** 분기는 HTTP 상태가 아니라 `error.code` 로 한다. 상태 코드는 보조 정보다.
- **반드시:** 에러 코드 목록은 공통 API 계약의 값을 `src/lib/api/error-codes.ts` 에 리터럴 유니온으로 옮겨 쓴다. 계약에 없는 코드를 프론트가 만들지 않는다(정규화용 `NETWORK_ERROR`, `UNKNOWN_ERROR` 제외).

```ts
// src/lib/api/api-error.ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isErrorBody(
  v: unknown,
): v is { error: { code: string; message: string; details?: unknown; requestId?: string } } {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const e = (v as { error: unknown }).error;
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  if (isErrorBody(body)) {
    const { code, message, details, requestId } = body.error;
    return new ApiError(res.status, code, message, details, requestId);
  }
  return new ApiError(res.status, 'UNKNOWN_ERROR', '잠시 후 다시 시도해 주세요.');
}
```

`fetch` 자체가 실패(`TypeError`)하면 `apiFetch` 에서 잡아 `new ApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.')` 로 던진다.

## 2. 사용자 메시지 표시

| 상황 | 표시 방식 |
|---|---|
| 조회 실패 | 화면 영역 안의 에러 상태 + [다시 시도] 버튼(`refetch`) |
| 동작(뮤테이션) 실패 | 토스트 또는 버튼 근처 인라인 메시지 |
| 교환안 버전 충돌·무효화 | "교환안이 변경되었어요" 모달 → 확인 시 최신 상태 다시 조회 |
| 행사 종료로 거부 | 종료 배너 표시 + 행사 쿼리 무효화 |
| 대체 제안 수락 실패(서버 재검사 실패) | 안내 후 교환 목록(T1)으로 이동 |
| AI 분석·추천 실패 | 수동 경로 안내(B1 → B2 전체 목록, C3 → [건너뛰기]) |
| 권한 없음·세션 없음 | 입장 화면(P1) 안내 |

- **반드시:** 사용자에게는 `error.message` 를 보여주되, 위 표처럼 특정 코드에 맞춘 문구·동작이 있으면 그것을 우선한다. 코드별 문구 매핑은 `lib/api/error-messages.ts` 한 곳에 둔다.
- **금지:** 스택 트레이스, 원본 응답, `details` 원문을 화면에 표시하는 것.
- **반드시:** AI 실패는 막다른 화면이 되면 안 된다. 항상 수동 선택 경로를 함께 보여준다.
- **반드시:** 실패한 뮤테이션 후에도 사용자가 다시 시도할 수 있게 버튼을 원래 상태로 되돌린다.

## 3. error.tsx / not-found.tsx

- **반드시:** 루트 `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx` 를 둔다.
- **반드시:** `src/app/events/[eventId]/error.tsx` 를 두어 행사 화면 에러가 하단 탭 밖으로 번지지 않게 한다.
- **반드시:** `error.tsx` 는 클라이언트 컴포넌트이며 [다시 시도](`reset`)와 [홈으로] 버튼을 제공한다.
- **반드시:** 존재하지 않는 행사·의류·교환안(서버가 not found 코드를 준 경우)은 화면에서 `notFound()` 를 호출하거나 같은 형태의 빈 상태 UI를 보여준다.
- **권장:** 쿼리 에러는 기본적으로 컴포넌트에서 처리하고 error boundary로 던지지 않는다(`throwOnError` 기본값 유지). 예상하지 못한 렌더링 에러만 `error.tsx` 가 받는다.

```tsx
// src/app/events/[eventId]/error.tsx
'use client';

export default function EventError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="p-6 text-center">
      <p>화면을 불러오지 못했어요.</p>
      <button type="button" onClick={reset}>다시 시도</button>
    </div>
  );
}
```

## 4. 폼 검증

- **반드시:** 폼 입력 검증은 Zod 스키마로 정의하고 제출 전에 `safeParse` 로 검사한다. 스키마는 `components/<domain>/` 의 폼 옆 또는 `lib/validation/` 에 둔다.
- **반드시:** 클라이언트 검증은 사용자 편의용이다. 서버가 검증 에러를 돌려주면 `details` 의 필드 정보(공통 계약에 정의된 형태)를 해당 입력 아래에 표시한다.
- **반드시:** 에러 메시지는 입력 필드 바로 아래에 표시하고 `aria-invalid`, `aria-describedby` 로 연결한다.
- **반드시:** 제출 중에는 제출 버튼을 비활성화해 중복 제출을 막는다.
- **권장:** 폼 라이브러리는 도입하지 않는다. 필드가 많아져 관리가 어려우면 `react-hook-form` 을 검토한다.
- **권장:** 사진은 업로드 전 형식(이미지 MIME)과 크기를 검사한다. 상한 값은 미정이므로 상수 하나(`MAX_PHOTO_BYTES`)로 두고 정해지면 바꾼다.

```ts
export const itemFormSchema = z.object({
  description: z.string().trim().min(1, '설명을 입력해 주세요.').max(500, '500자 이내로 입력해 주세요.'),
  photo: z.instanceof(File, { message: '사진을 선택해 주세요.' }),
});
```

검증 길이 등 수치는 예시이며 서버 제약이 정해지면 맞춘다.
