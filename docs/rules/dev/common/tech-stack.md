# 기술 스택과 환경

## 1. 버전 정책

- **반드시** 아래 메이저 버전을 기준으로 한다. 마이너·패치는 설치 시점 최신 안정 버전을 쓰고 lock 파일로 고정한다.
- **금지:** alpha/beta/rc 등 프리릴리스 버전 사용.
- **금지:** 해커톤 기간 중 메이저 버전 업그레이드. 보안 패치(패치 버전)만 허용한다.
- 버전은 2026-10-27 기준 PyPI·npm 레지스트리로 확인했다. 세부 도구 버전은 backend/frontend 규칙 README를 따른다.

| 구분 | 기준 버전 | 비고 |
|---|---|---|
| Python | **3.14** | 3.15.0이 2026-10 초 출시됐으나 라이브러리 호환성을 위해 직전 메이저를 쓴다. |
| FastAPI | **0.x 최신 (확인 시점 0.162)** | 1.0 미출시. 0.x는 마이너 간 변경이 있을 수 있어 lock으로 고정한다. |
| Pydantic | **2.x (확인 시점 2.14)** | FastAPI 기본 의존성. |
| SQLite | **3.x** | Python 내장 `sqlite3` 사용. |
| Node.js | **24 LTS** | 26은 확인 시점(2026-10-27) LTS 표기 전. |
| Next.js | **16.x** | 2026-10 기준 16.4 라인. App Router 사용. |
| React | **19.x** | Next.js 16 권장 버전을 따른다. |
| TypeScript | **6.0.x** | 최신은 7.x지만 `typescript-eslint`가 6.1 미만만 지원해 6.0으로 고정. 린트 도구가 7을 지원하면 올린다. |
| Tailwind CSS | **4.x** | 2026 중반 기준 4.3 라인. |
| uv | 최신 안정 | 백엔드 패키지·가상환경 관리. |
| pnpm | **12.x** | `packageManager` 필드로 고정. |

## 2. 모노레포 구조

```text
meta-hackathon-2026/
├─ backend/          # FastAPI 앱 (uv 프로젝트, pyproject.toml, uv.lock)
├─ frontend/         # Next.js 앱 (pnpm, package.json, pnpm-lock.yaml)
├─ docs/             # 기획·규칙·설계 문서
├─ AGENTS.md
└─ PROJECT.md
```

- **반드시** 백엔드 코드는 `backend/`, 프론트엔드 코드는 `frontend/` 안에만 둔다. 루트에는 문서와 공통 설정(`.gitignore`, `.editorconfig` 등)만 둔다.
- **금지:** `backend/`와 `frontend/`가 서로의 파일을 직접 import·참조하는 것. 두 앱의 접점은 HTTP API([api-contract.md](api-contract.md))뿐이다.
- 각 디렉토리 내부 구조는 `backend/`, `frontend/` 규칙 문서를 따른다.

## 3. 패키지 매니저

- **반드시** 백엔드는 `uv`, 프론트엔드는 `pnpm`을 쓴다.
- **금지:** 백엔드에서 `pip install`로 직접 설치, 프론트엔드에서 `npm`/`yarn` 사용. lock 파일이 섞이면 안 된다.
- **반드시** `uv.lock`, `pnpm-lock.yaml`을 커밋한다.
- **권장:** 의존성 추가는 꼭 필요한 것만. 추가 시 PR 설명에 이유를 한 줄 적는다.

```bash
cd backend && uv add fastapi        # 백엔드 의존성 추가
cd frontend && pnpm add zod         # 프론트엔드 의존성 추가
```

## 4. 환경변수 정책

- **반드시** 환경별로 달라지는 값(API 주소, 키, DB 경로, CORS 허용 도메인 등)은 환경변수로 받는다. 코드에 하드코딩하지 않는다.
- **반드시** 각 앱 디렉토리에 `.env.example`을 커밋하고, 필요한 모든 키를 빈 값 또는 더미 값과 한 줄 설명으로 적는다.
- **금지:** 실제 값이 든 `.env`, `.env.local` 등을 커밋하는 것. 루트 `.gitignore`에 `.env*`를 넣고 `!.env.example`만 예외로 둔다.
- **반드시** 앱 시작 시 필수 환경변수가 없으면 즉시 실패(명확한 에러 메시지)하게 한다. 조용히 기본값으로 동작하지 않는다.
- 키 이름은 `UPPER_SNAKE_CASE`로 쓴다.

| 위치 | 파일 | 예시 키 |
|---|---|---|
| backend | `backend/.env` | `DATABASE_URL`, `META_API_KEY`, `CORS_ORIGINS`, `LOG_LEVEL` |
| frontend | `frontend/.env.local` | `NEXT_PUBLIC_API_BASE_URL` |

## 5. 비밀정보 관리

- **금지:** API 키·토큰·비밀번호를 코드, 커밋, PR, 이슈, 로그, 스크린샷에 남기는 것.
- **금지:** 프론트엔드에 비밀정보를 두는 것. `NEXT_PUBLIC_` 접두사가 붙은 값은 브라우저에 그대로 노출되므로 공개해도 되는 값만 넣는다.
- **반드시** Meta Model API 키 등 외부 서비스 키는 백엔드 환경변수에서만 읽고, 모델 호출은 백엔드에서만 한다.
- **반드시** 비밀정보가 커밋된 것을 발견하면 즉시 해당 키를 폐기·재발급하고 팀에 알린다. 히스토리에서 지우는 것만으로는 부족하다.
- 팀 내 키 공유는 메신저 공개 채널이 아닌 1:1 전달이나 배포 플랫폼의 환경변수 설정을 쓴다.

## 참고 출처

- [Next.js 릴리스 (Wikipedia)](https://en.wikipedia.org/wiki/Next.js), [Next.js EOL 표 (versio.io)](https://www.versio.io/en/product-release-end-of-life-eol-vercel-nextjs.html)
- [FastAPI 다운로드 통계·버전 (pepy.tech)](https://pepy.tech/projects/fastapi)
- [Python 3.15.0 릴리스](https://python.org/downloads/release/python-3150/)
- [TypeScript 7.0 정식 출시 (gihyo.jp)](https://gihyo.jp/article/2026/07/typescript-7-0), [TypeScript 6.0 (codersera)](https://codersera.com/blog/typescript-6-0-whats-new-breaking-changes-2026/)
- [Tailwind CSS 버전 (versionlog)](https://versionlog.com/tailwind-css/), [endoflife.date](https://endoflife.date/tailwind-css)
- [pnpm 11 RC (InfoQ)](https://infoq.com/news/2026/04/pnpm-11-rc-release/), [pnpm 11 (bytes.dev)](https://bytes.dev/archives/484)
