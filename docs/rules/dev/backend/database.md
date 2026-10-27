# 데이터베이스 규칙

테이블 구성은 [database-design-v1.md](../../../plans/database-design-v1.md)를 따른다. 이 문서는 SQLite·SQLAlchemy·Alembic 사용 규칙과 무결성 보장 방법을 정한다.

## SQLite 연결 설정

`core/db.py`에서 **반드시** 아래 설정을 적용한다.

```python
engine = create_engine(
    settings.database_url,  # 예: sqlite:///./data/app.db
    connect_args={"check_same_thread": False, "timeout": 5},
)

@event.listens_for(engine, "connect")
def _on_connect(dbapi_conn, _record) -> None:
    dbapi_conn.isolation_level = None          # pysqlite 자동 BEGIN 끄기
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")     # SQLite 기본값은 OFF
    cur.execute("PRAGMA journal_mode = WAL")    # 읽기·쓰기 동시 진행
    cur.execute("PRAGMA busy_timeout = 5000")   # 잠금 시 5초 대기
    cur.execute("PRAGMA synchronous = NORMAL")
    cur.close()

@event.listens_for(engine, "begin")
def _on_begin(conn) -> None:
    conn.exec_driver_sql("BEGIN IMMEDIATE")     # 트랜잭션 시작 시 쓰기 잠금 확보

SessionLocal = sessionmaker(engine, expire_on_commit=False, autobegin=False)
```

- `autobegin=False`로 **명시적 트랜잭션 없이 DB에 접근하면 에러**가 나게 한다. 의도치 않게 열린 트랜잭션이 잠금을 오래 잡는 것을 막는다.

- `BEGIN IMMEDIATE`는 트랜잭션 시작 시점에 쓰기 잠금을 잡아 **동시 쓰기를 직렬화**한다. "읽고 검사한 뒤 쓰기" 사이에 다른 요청이 끼어드는 문제를 막는 핵심 장치이므로 끄지 않는다.
- DB 파일은 `data/` 아래에 두고 git에 커밋하지 않는다(`.gitignore`).

## 동시성 한계 (알고 쓰기)

- SQLite는 **쓰기 1개만 동시 진행**한다. 위 설정에서는 읽기 트랜잭션도 잠금을 잡으므로 요청이 사실상 한 줄로 처리된다. 행사 단위(수십 명) 규모에서는 충분하다.
- Uvicorn 워커는 **1개**로 실행한다. 여러 서버 인스턴스가 같은 DB 파일을 공유하는 구성(네트워크 파일시스템 포함)은 **금지**.
- 트랜잭션 안에서 AI 호출·파일 업로드 등 느린 I/O를 하는 것은 **금지**. 잠금을 오래 잡아 다른 요청이 `database is locked`로 실패한다. 느린 작업은 트랜잭션 밖에서 끝내고, 짧은 트랜잭션으로 결과만 저장한다.
- 규모가 커지면 PostgreSQL 전환을 검토한다. 이를 위해 SQLite 전용 SQL은 `core/db.py`와 마이그레이션에만 둔다(권장).

## 트랜잭션

- 모든 DB 접근(읽기 포함)은 `with db.begin():` 블록 안에서 한다. 블록이 정상 종료되면 커밋, 예외면 롤백된다.
- 트랜잭션 경계는 **서비스 메서드 1개 = 트랜잭션 1개**가 기본이다. 단, AI 호출이 있는 서비스는 "읽기 트랜잭션 → (트랜잭션 밖) AI 호출 → 쓰기 트랜잭션"으로 나눈다.
- `deps.get_current_participant`도 자체 `with db.begin():` 블록에서 조회를 끝낸다. 권한 판단에 필요한 값(행사 상태, 소유권)은 서비스 트랜잭션에서 다시 읽는다.
- 리포지토리에서 `begin()`/`commit()` 호출 **금지**. 필요하면 `flush()`만 한다.
- 검사(행사 상태·소유권·버전·의류 상태)와 그 결과에 따른 변경은 **반드시 같은 트랜잭션** 안에서 한다.

```python
def confirm_if_all_agreed(self, actor: Participant, proposal_id: int, version: int) -> TradeProposal:
    with self.db.begin():
        event = self.events.get_active(actor.event_id)        # 종료됐으면 EventClosedError
        proposal = self.trades.get(proposal_id)               # BEGIN IMMEDIATE로 이미 직렬화됨
        ensure_version(proposal, version)                     # 다르면 StaleProposalError
        self.trades.record_agreement(proposal, actor)
        if self.trades.all_agreed(proposal):
            self._confirm(proposal)                           # 아래 "중복 확정 방지"
        return proposal
```

## 무결성은 DB 제약 + 트랜잭션으로 보장

애플리케이션 검사만 믿지 않는다. DB가 마지막 방어선이다.

- 외래 키, `NOT NULL`, `CHECK`(상태 값 목록, `offered_clothing_id != received_clothing_id` 등), `UNIQUE`(`trade_participants(proposal_id, participant_id)`)를 모델에 **반드시** 선언한다.
- 상태 컬럼은 `CHECK (status IN (...))`로 허용 값을 제한한다. enum 값은 `domain/enums.py`와 일치시킨다.

### 옷 중복 확정 방지

확정 시 아래 두 가지를 **모두** 적용한다.

1. **조건부 업데이트 + 영향 행 수 검사 (반드시):** 의류를 "교환 가능"일 때만 "확정"으로 바꾸고, 바뀐 행 수가 교환안의 의류 수와 다르면 예외를 던져 트랜잭션 전체를 롤백한다.

```python
result = db.execute(
    update(Clothing)
    .where(Clothing.id.in_(clothing_ids), Clothing.status == ClothingStatus.AVAILABLE)
    .values(status=ClothingStatus.CONFIRMED)
)
if result.rowcount != len(clothing_ids):
    raise ClothingUnavailableError(...)   # with 블록 탈출 → 롤백
```

2. **부분 유니크 인덱스 (반드시):** "확정된 교환에 속한 제공 의류"가 한 번만 존재하도록 `trade_participants.is_confirmed`에 부분 고유 인덱스를 건다. 상태가 `trade_proposals`에 있어 부분 인덱스 조건으로 쓸 수 없으므로 이 컬럼을 둔다([database-design-v1.md](../../../plans/database-design-v1.md) 3.8).

```python
is_confirmed: Mapped[bool] = mapped_column(default=False, server_default=text("0"))

__table_args__ = (
    Index("uq_confirmed_offered_clothing", "offered_clothing_id",
          unique=True, sqlite_where=text("is_confirmed = 1")),
)
```

- **반드시** 확정 시 교환안 상태·`clothes.status`·`is_confirmed`를 한 트랜잭션에서 함께 바꾼다. 취소 시에도 세 값을 함께 되돌린다. 이 묶음은 리포지토리의 `mark_confirmed()`/`mark_cancelled()` 한 곳에서만 처리한다.
- `IntegrityError`(`uq_confirmed_offered_clothing`)는 `ClothingUnavailableError`로 변환한다.
- **반드시** 테스트에서 불변식을 검사한다: `is_confirmed = 1`인 행 ⇔ 교환안 상태가 확정 ⇔ 제공 의류 상태가 확정.

- 미확정 교환안에는 같은 옷이 여러 번 나올 수 있으므로 `offered_clothing_id`에 무조건 `UNIQUE`를 거는 것은 **금지**.
- 확정과 같은 트랜잭션에서 해당 옷이 포함된 다른 미확정 교환안을 무효화한다.
- 행사 종료와 확정의 경쟁도 같은 원리로 처리한다: 확정 트랜잭션 안에서 행사 상태를 다시 읽고, 종료 트랜잭션은 `UPDATE events SET status='closed' WHERE status='active'`로 처리한다. `BEGIN IMMEDIATE` 덕분에 둘 중 하나가 먼저 끝난 뒤 다른 하나가 최신 상태를 본다.

## ORM 규칙 (SQLAlchemy 2.x)

- 2.0 스타일만 사용: `DeclarativeBase`, `Mapped[...]`, `mapped_column()`, `select()`. `session.query()` **금지**.
- 관계 로딩은 기본 lazy를 두되, 목록 조회에서 N+1이 생기면 `selectinload`를 명시한다.
- 시각 컬럼은 UTC로 저장한다. 직렬화 형식은 [../common/api-contract.md](../common/api-contract.md)를 따른다.
- 행사 생성(행사 → 주최자 참가자 → `organizer_participant_id` 연결)은 하나의 트랜잭션으로 처리한다. `organizer_participant_id`는 nullable로 두고 서비스에서 생성 직후 채운다.
- 원시 SQL은 마이그레이션과 `core/db.py` 외에는 **금지**. 불가피하면 `text()`와 바인드 파라미터만 사용하고 문자열 포맷팅으로 SQL을 만드는 것은 **금지**.

## 마이그레이션 (Alembic)

- 스키마 변경은 **반드시** Alembic 리비전으로 한다. `Base.metadata.create_all()`은 테스트에서만 허용.
- `alembic/env.py`에서 `render_as_batch=True`를 **반드시** 켠다(SQLite는 `ALTER TABLE` 제약이 많아 batch 모드 필요).
- 제약·인덱스에 이름을 붙이도록 `MetaData(naming_convention=...)`를 설정한다(batch 마이그레이션에 필요).
- 자동 생성(`alembic revision --autogenerate -m "..."`) 후 파일을 **반드시** 읽고 수정한다. 부분 인덱스·CHECK는 누락될 수 있다.
- 이미 공유된 리비전 파일 수정 **금지**. 새 리비전을 추가한다. 해커톤 중 초기 단계에서 팀 합의 시 리비전을 합치는 것은 허용.
