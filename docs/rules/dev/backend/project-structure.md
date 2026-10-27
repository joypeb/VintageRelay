# 프로젝트 구조

## 디렉토리

```text
backend/
├── pyproject.toml          # 의존성, ruff·mypy·pytest 설정
├── uv.lock                 # 반드시 커밋
├── alembic.ini
├── alembic/versions/       # 마이그레이션 파일
├── app/
│   ├── main.py             # FastAPI 앱 생성, 라우터·미들웨어·예외 핸들러 등록
│   ├── core/
│   │   ├── config.py       # pydantic-settings 기반 설정
│   │   ├── db.py           # engine, SessionLocal, SQLite pragma
│   │   └── logging.py      # 로깅 설정, 요청 ID 미들웨어
│   ├── api/
│   │   ├── deps.py         # get_db, get_current_participant, require_organizer
│   │   ├── errors.py       # 전역 exception handler
│   │   └── routers/        # events.py, clothes.py, intents.py, trades.py ...
│   ├── schemas/            # Pydantic 요청·응답 모델 (리소스별 파일)
│   ├── services/           # 유스케이스, 트랜잭션 경계, 권한·상태 검사
│   ├── repositories/       # SQLAlchemy 쿼리
│   ├── models/             # SQLAlchemy ORM 모델 (테이블별 파일)
│   ├── domain/
│   │   ├── errors.py       # 도메인 예외 계층
│   │   ├── enums.py        # 상태 값 (EventStatus, ClothingStatus ...)
│   │   └── matching.py     # 2인·3인 순환 탐색, 대체 의류 감지 (순수 함수)
│   └── ai/
│       ├── client.py       # Meta Model API 호출
│       └── schemas.py      # AI 구조화 출력 모델
└── tests/
```

리소스 단위 파일명은 DB 테이블과 맞춘다(예: `models/clothing.py`, `schemas/clothing.py`, `services/clothing.py`, `repositories/clothing.py`).

## 계층 책임

| 계층 | 한다 | 하지 않는다 |
|---|---|---|
| `api/routers` | 경로 정의, 요청 파싱, 의존성 주입, 서비스 호출, 응답 모델 반환 | 비즈니스 규칙, 쿼리, 커밋 |
| `services` | 유스케이스 흐름, 행사 상태·소유권·버전 검사, 트랜잭션 커밋, AI 호출 | HTTP 개념(`Request`, `HTTPException`, 상태 코드) |
| `repositories` | `select`/`insert`/`update` 작성, 조건부 업데이트 | 커밋, 비즈니스 판단 |
| `models` | 테이블·컬럼·제약 정의 | 로직 |
| `domain` | 순수 규칙(순환 탐색 등), 예외, enum | DB·HTTP·AI 접근 |
| `ai` | 외부 모델 호출과 응답 파싱 | DB 접근, 의향·동의 변경 |

## 의존성 방향

```text
api → services → repositories → models
          ↓            ↓
        domain  ←──────┘
          ↑
          ai (services에서만 호출)
```

- **반드시** 위 방향으로만 import 한다. 역방향(예: `services`가 `api`를, `repositories`가 `services`를 import)은 **금지**.
- `domain`은 다른 앱 패키지를 import 하지 않는다(표준 라이브러리만).
- 라우터가 `repositories`나 `models`를 직접 쓰는 것은 **금지**. 단순 조회라도 서비스를 거친다.
- `schemas`(API 모델)를 `repositories`에서 쓰는 것은 **금지**. 서비스가 ORM 객체 → 스키마 변환을 담당하거나 `model_validate(obj)`로 라우터에서 변환한다.

## 교환 로직 배치

- 2인·3인 순환 탐색과 대체 의류 제안 감지는 `domain/matching.py`의 **순수 함수**로 작성한다. 입력은 의향 목록(dataclass/tuple), 출력은 후보 순환 목록이다. DB 없이 단위 테스트할 수 있어야 한다.
- 교환안 생성·동의·확정·취소의 트랜잭션은 `services/trade.py`가 담당한다.
