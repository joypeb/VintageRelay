# 테스트

해커톤 프로토타입이므로 **깨지면 시연이 망가지는 곳**만 테스트한다. 커버리지 목표는 두지 않는다.

## 1. 도구

| 용도 | 도구 |
|---|---|
| 단위·컴포넌트 테스트 | Vitest + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`, 환경 `jsdom` |
| API 모킹 | `vi.mock` 으로 `lib/api/<domain>.ts` 함수 모킹. 필요 시 MSW |
| E2E (필요 시) | Playwright, 모바일 뷰포트(`devices['iPhone 15']` 등) |

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

`async` 서버 컴포넌트는 Vitest로 렌더링이 지원되지 않으므로 테스트하지 않는다. 로직은 클라이언트 컴포넌트나 순수 함수로 분리해 테스트한다.

## 2. 반드시 테스트하는 것

- **`lib/api/api-error.ts`:** 공통 에러 형식 파싱, 형식이 아닌 본문, 네트워크 실패 정규화.
- **순수 함수:** 상태 라벨 매핑, 날짜 포맷, 주최자 여부 판단, 경로 생성(`routes`).
- **교환안 동의 화면(T2) 핵심 분기:** 
  - 대기 상태에서 [동의] 클릭 시 현재 `version` 으로 요청한다.
  - 버전 충돌 에러 시 변경 안내를 표시한다.
  - 무효·종료 상태에서는 동의 버튼이 비활성화된다.
- **폼 검증 스키마:** 필수값 누락, 길이 초과.

## 3. 작성 규칙

- **반드시:** 사용자 관점으로 조회한다. `getByRole`, `getByLabelText`, `getByText` 순으로 쓰고 `data-testid` 는 최후 수단으로만 쓴다.
- **반드시:** 상호작용은 `userEvent` 로 한다(`fireEvent` 지양).
- **반드시:** 쿼리 훅을 쓰는 컴포넌트는 테스트마다 새 `QueryClient`(`retry: false`)로 감싸는 `renderWithClient` 헬퍼를 쓴다(`src/test/render.tsx`).
- **금지:** 실제 백엔드·Meta Model API 호출. 단위 테스트는 네트워크 없이 돈다.
- **금지:** 구현 세부(내부 state, 클래스 이름) 검증, 스냅샷 테스트.
- **권장:** 테스트 이름은 한국어로 동작을 쓴다. 예: `it('행사가 종료되면 동의 버튼을 비활성화한다')`.

```tsx
it('버전 충돌이면 변경 안내를 보여준다', async () => {
  vi.mocked(consentTrade).mockRejectedValue(new ApiError(409, 'PROPOSAL_VERSION_MISMATCH', '변경됨'));
  renderWithClient(<TradeDetailScreen eventId="e1" tradeId="t1" />);

  await userEvent.click(await screen.findByRole('button', { name: '동의' }));

  expect(await screen.findByRole('dialog')).toHaveTextContent('교환안이 변경되었어요');
});
```

에러 코드 값은 예시이며 공통 API 계약의 실제 코드를 쓴다.

## 4. E2E (선택)

시간이 남으면 Playwright로 시연 시나리오 1~2개만 자동화한다. 백엔드를 띄운 상태에서 실행한다.

1. 행사 생성 → 입장코드로 두 번째 참가자 입장 → 각자 옷 등록 → 서로 의향 등록 → 2인 교환안 동의 → 확정 화면 확인
2. 행사 종료 후 동의 버튼 비활성화 확인

## 5. 실행

- **반드시:** PR 전에 `pnpm test` 를 통과시킨다.
- **권장:** 작업 중에는 `pnpm vitest` (watch 모드)를 쓴다.
