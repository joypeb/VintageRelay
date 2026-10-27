# 프론트엔드 개발 규칙

Vintage Relay **모바일 웹** 프론트엔드의 개발 규칙이다. 해커톤 프로토타입이므로 실행 가능한 최소 규칙만 둔다.

> **읽는 범위:** 프론트엔드 작업자는 `docs/rules/dev/common/` 규칙과 이 디렉토리(`frontend/`) 규칙만 읽는다. **backend 규칙은 읽지 않는다.** 서버와의 약속은 공통 API 계약([../common/api-contract.md](../common/api-contract.md))으로만 맞춘다.

규칙 강도는 세 단계로 표기한다.

- **반드시:** 지키지 않으면 리뷰에서 반려한다.
- **금지:** 사용하지 않는다. 예외가 필요하면 코드에 사유 주석을 남긴다.
- **권장:** 기본값으로 따르되 상황에 따라 벗어날 수 있다.

## 기술 스택과 버전

2026-10-27에 npm 레지스트리와 Node.js 배포 목록에서 확인한 최신 안정 버전 기준이다. 프로젝트 생성 시 `package.json`에 실제 설치 버전을 고정하고 이 표와 다르면 표를 갱신한다.

| 항목 | 버전 | 비고 |
|---|---|---|
| Node.js | 24.x LTS (Krypton, 확인 시점 24.22.1) | `.nvmrc`/`engines`로 고정. 26.x는 확인 시점에 아직 LTS 표기 전 |
| pnpm | 12.x (확인 시점 12.15.0) | `packageManager` 필드로 고정, `corepack enable` |
| Next.js | 16.x (확인 시점 16.4.3), App Router | Turbopack 기본. `next lint`는 없으므로 ESLint CLI 직접 실행 |
| React / React DOM | 19.x (확인 시점 19.3.1) | |
| TypeScript | **6.0.x** (확인 시점 6.0.3) | 최신은 7.0.2지만 `typescript-eslint` 8.72.1의 지원 범위가 `<6.1.0`이라 6.0으로 고정한다. 린트 도구가 7을 지원하면 올린다 |
| Astryx | 0.7.x (확인 시점 0.7.4): `@astryxdesign/core`, `@astryxdesign/theme-chocolate`, `@astryxdesign/cli`(dev) | UI 컴포넌트·디자인 토큰. 사전 빌드 CSS를 쓰므로 StyleX 컴파일러 플러그인은 두지 않는다. peer 의존성 `@stylexjs/stylex` 0.19.x |
| Tailwind CSS | 4.x (확인 시점 4.3.3) + `@tailwindcss/postcss` | 레이아웃 보정용. Astryx 토큰 브리지(`tailwind-theme.css`) 사용, `tailwind.config.js` 없음 |
| ESLint | **9.x** (확인 시점 9.39.5), flat config | `eslint-config-next` 16.x + `typescript-eslint`. 10.x는 `eslint-plugin-import` 2.32가 지원하지 않아 `import/order` 실행 중 크래시가 나므로 9로 고정한다 |
| Prettier | 3.x (확인 시점 3.9.10) + `prettier-plugin-tailwindcss` 0.8.x | |
| TanStack Query | 5.x (확인 시점 5.105.0) | 서버 상태 관리 |
| Zod | 4.x (확인 시점 4.6.7) | 폼 검증 |
| Vitest | 5.x (확인 시점 5.0.5) + Testing Library React 16.x | 필요 시 Playwright 1.6x |

## 목차

| 문서 | 내용 |
|---|---|
| [project-structure.md](project-structure.md) | 디렉토리 배치, `app/` 라우팅과 화면 ID 매핑, 서버/클라이언트 컴포넌트 기준 |
| [code-style.md](code-style.md) | TypeScript strict, 네이밍, 컴포넌트 작성, import 순서, 린트·포맷 |
| [styling.md](styling.md) | Astryx 컴포넌트·테마, Tailwind v4 규칙, 디자인 토큰, 조건부 클래스, 접근성 기본 |
| [data-fetching.md](data-fetching.md) | API 클라이언트, 타입, TanStack Query, 폴링, 환경변수 |
| [error-handling.md](error-handling.md) | API 에러 파싱, `error.tsx`/`not-found.tsx`, 사용자 메시지, 폼 검증 |
| [logging.md](logging.md) | 클라이언트 로깅 기준과 민감정보 금지 |
| [testing.md](testing.md) | Vitest + Testing Library 최소 테스트 전략 |

## 공통 규칙 (common)

아래 항목은 프론트 규칙에서 다시 정의하지 않는다.

- 커밋 메시지, 브랜치 등 git workflow: [../common/](../common/) 의 git 관련 문서
- API 에러 응답 형식, JSON 필드 케이스, 날짜 형식: [../common/api-contract.md](../common/api-contract.md)

## 기본 명령

```bash
pnpm dev          # 개발 서버
pnpm build        # 프로덕션 빌드
pnpm lint         # eslint .
pnpm format       # prettier --write .
pnpm typecheck    # next typegen && tsc --noEmit
pnpm test         # vitest run
```

PR 전에 `pnpm lint && pnpm typecheck && pnpm test`를 **반드시** 통과시킨다.
