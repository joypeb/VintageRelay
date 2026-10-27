# 클라이언트 로깅

프로토타입 단계에서는 외부 로그 수집 서비스(Sentry 등)를 도입하지 않는다. 브라우저 콘솔만 쓴다.

## 1. console 사용 기준

| 메서드 | 사용 | 운영 빌드 |
|---|---|---|
| `console.error` | 복구하지 못한 예상 밖 에러(`error.tsx`, `global-error.tsx`, `ApiError` 가 아닌 예외) | 유지 |
| `console.warn` | 계약과 다른 응답 형태, 폴백 경로로 전환(예: AI 실패 후 수동 경로) | 유지 |
| `console.log`, `console.debug`, `console.info` | 개발 중 디버깅 | **제거** |

- **반드시:** ESLint `no-console` 규칙으로 `warn`, `error` 외 사용을 막는다([code-style.md](code-style.md) 설정 참고). 디버깅용 `console.log` 는 커밋 전에 지운다.
- **반드시:** 운영 빌드에서는 `next.config.ts` 의 `compiler.removeConsole` 로 `error`, `warn` 외 콘솔 호출을 제거한다.

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
};

export default nextConfig;
```

- **반드시:** 직접 `console.*` 를 흩뿌리지 않고 `src/lib/logger.ts` 를 거친다. 나중에 수집 서비스를 붙일 때 이 파일만 바꾼다.

```ts
// src/lib/logger.ts
export const logger = {
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[vr] ${msg}`, ctx ?? ''),
  error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) =>
    console.error(`[vr] ${msg}`, err, ctx ?? ''),
};
```

## 2. 무엇을 남기는가

- **반드시:** 로그 메시지는 무엇을 하다 실패했는지 한 줄로 쓰고 식별자만 컨텍스트로 붙인다. 예: `logger.error('consent failed', err, { eventId, tradeId, version })`.
- **권장:** `ApiError` 는 `code`, `status` 만 남긴다. 사용자에게 이미 안내한 예상된 에러(검증 실패, 버전 충돌, 행사 종료)는 로그를 남기지 않는다.

## 3. 민감정보 금지

아래는 로그에 **절대 남기지 않는다**.

- 세션 토큰·인증 헤더·쿠키 값, 입장코드
- 참가자 표시 이름, 사용자가 입력한 취향·거부 조건 원문, 의류 설명 원문
- 사진 파일 내용, `File` 객체, 이미지 URL 전체(서명 쿼리 포함 가능)
- 요청·응답 본문 전체

ID(`eventId`, `tradeId`, `itemId`)와 에러 코드만 남기는 것을 기본으로 한다.
