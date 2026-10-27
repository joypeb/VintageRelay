# 백엔드 개발 규칙

Vintage Relay 백엔드(FastAPI + SQLite)를 구현할 때 따르는 규칙이다. 해커톤 프로토타입이므로 **실행 가능한 최소 규칙**만 둔다.

> 이 문서는 반드시 [공통 규칙(`../common/`)](../common/)과 함께 읽는다. 커밋·git 흐름, API 에러 응답 공통 포맷, JSON 필드 케이스, 날짜 형식은 공통 규칙에서 정의하며 여기서 다시 정의하지 않는다.

## 용어

- **반드시:** 어기면 리뷰에서 수정한다.
- **금지:** 사용하지 않는다. 예외가 필요하면 이유를 코드 주석으로 남긴다.
- **권장:** 특별한 이유가 없으면 따른다.

## 기준 버전 (2026-10-27 PyPI·endoflife.date 확인)

| 항목 | 버전 | 비고 |
|---|---|---|
| Python | 3.14.x | 3.15는 2026-10 출시 직후라 FastAPI 지원 표기가 3.14까지여서 보류 |
| FastAPI | 0.162.x | `fastapi[standard]` |
| Pydantic | 2.14.x | v2 문법만 사용 |
| pydantic-settings | 2.16.x | 환경 변수 설정 |
| SQLAlchemy | 2.1.x | 2.0 스타일(`select()`, `Mapped[]`) |
| Alembic | 1.20.x | 마이그레이션 |
| Uvicorn | 0.54.x | ASGI 서버 |
| httpx | 0.28.x | AI API 호출, 테스트 클라이언트 |
| uv | 0.13.x | 패키지·가상환경 관리 |
| ruff | 0.17.x | 린트 + 포맷 |
| mypy | 2.4.x | 타입 체크 |
| pytest | 9.1.x | 테스트 |

- 버전은 `pyproject.toml`에 하한(`>=`)으로 적고 `uv.lock`을 커밋해 고정한다.
- 의존성 추가는 `uv add <pkg>`(개발용은 `uv add --dev`)로만 한다. `pip install` **금지**.

## 목차

| 문서 | 내용 |
|---|---|
| [project-structure.md](project-structure.md) | 디렉토리 구조, 계층과 의존성 방향 |
| [code-style.md](code-style.md) | Python 스타일, 타입 힌트, ruff/mypy, async 기준, Pydantic 스키마 |
| [api.md](api.md) | 라우터, 요청·응답 모델, 의존성 주입, 권한 검사 위치 |
| [database.md](database.md) | SQLite 설정, 트랜잭션, 동시성, ORM·Alembic, 중복 확정 방지 |
| [error-handling.md](error-handling.md) | 도메인 예외, 전역 핸들러, 공통 에러 포맷 구현 |
| [logging.md](logging.md) | 로깅 설정, 요청 ID, 레벨, 민감정보 마스킹 |
| [testing.md](testing.md) | pytest 구조, 테스트 DB, 교환 규칙 우선 테스트 |
| [ai-integration.md](ai-integration.md) | AI 호출 격리, 타임아웃·재시도, AI 책임 범위 |

## 자주 쓰는 명령

```bash
uv sync                                  # 의존성 설치
uv run fastapi dev app/main.py           # 개발 서버
uv run alembic upgrade head              # 마이그레이션 적용
uv run ruff check --fix . && uv run ruff format .
uv run mypy app
uv run pytest
```

PR(또는 커밋) 전에 `ruff check`, `ruff format --check`, `mypy`, `pytest`가 모두 통과해야 한다.

## 상위 원칙

- 교환 규칙(1벌↔1벌, 2인·3인 순환, 전원 동의, 같은 버전, 중복 확정 금지)은 [AGENTS.md](../../../../AGENTS.md)와 [PROJECT.md](../../../../PROJECT.md)를 따른다.
- 미정 사항(인증·세션 복원, 전달 기록, 보관 정책 등)을 코드에서 확정된 규칙처럼 굳히지 않는다. 임시 구현은 한 곳에 모으고 `# TODO(미정):` 주석을 단다.
