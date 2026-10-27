# 테스트

pytest만 사용한다. 시간이 부족한 해커톤이므로 **교환 규칙과 무결성 테스트를 가장 먼저** 작성하고, 단순 CRUD는 API 테스트 몇 개로 대신한다.

## 구조

```text
tests/
├── conftest.py           # engine, db, client, 팩토리, AI fake
├── unit/
│   └── test_matching.py  # domain/matching.py 순수 함수 (DB 없음)
├── services/             # 서비스 + 실제 SQLite
│   ├── test_trade_confirm.py
│   └── test_trade_cancel.py
└── api/                  # TestClient로 HTTP 계약·권한·에러 포맷
    └── test_events.py
```

- 파일 `test_<대상>.py`, 함수 `test_<상황>_<기대결과>` (예: `test_confirm_when_clothing_already_confirmed_raises_conflict`).
- 테스트 이름이나 docstring에 한국어 설명을 써도 된다.
- 하나의 테스트는 한 가지 규칙만 검증한다. Given/When/Then 순으로 빈 줄로 구분한다(권장).

## 테스트 DB

- **실제 SQLite 파일**을 `tmp_path`에 만들어 쓴다. 운영과 같은 `core/db.py`의 엔진 설정(pragma, `BEGIN IMMEDIATE`)을 재사용한다.
- `:memory:` DB는 연결마다 별개 DB라 동시성 테스트가 불가능하므로 서비스·API 테스트에서 **금지**.
- 스키마는 `Base.metadata.create_all()`로 만든다. 마이그레이션 검증은 별도 테스트 1개(`alembic upgrade head`가 빈 DB에서 성공)로 확인한다(권장).
- 테스트 간 상태 공유 **금지**. DB는 테스트마다 새로 만든다(파일 생성 비용은 작다).
- 외부 AI는 **반드시** fake로 교체한다(`app.dependency_overrides`). 테스트에서 실제 Meta API 호출 **금지**.

```python
@pytest.fixture
def engine(tmp_path: Path) -> Iterator[Engine]:
    eng = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()

@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: _session(engine)
    app.dependency_overrides[get_ai_client] = lambda: FakeAIClient()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- 행사·참가자·옷·의향 생성은 `conftest.py`의 팩토리 함수로 한다. 테스트마다 수동 INSERT 반복 **금지**.

## 우선 테스트 목록

아래는 구현과 함께 **반드시** 작성한다. 위에서부터 우선순위가 높다.

### 1. 순환 탐색 (unit)

- 2인: A(바지→재킷 원함), B(재킷→바지 원함) → 2인 교환안 1개.
- 3인: A→B→C→A 의향 → 3인 교환안 1개, 각자 1벌 주고 1벌 받음.
- C가 A의 옷을 원하지 않으면 → 교환안 없음.
- 4인 순환만 가능한 경우 → 교환안 없음(범위 밖).
- 같은 참가자가 서로 다른 옷으로 두 교환안에 등장 가능.
- 본인 옷끼리, 다른 행사 옷과의 순환은 만들지 않음.
- 대체 의류: 다른 본인 옷으로 바꾸면 3인 순환이 완성되는 경우 감지, 의향은 변경하지 않음.

### 2. 확정과 중복 확정 방지 (services)

- 전원 동의 시에만 확정, 일부 동의는 대기 상태 유지.
- 이전 버전에 대한 동의 → `StaleProposalError`, 동의 기록 안 됨.
- 같은 옷을 포함한 두 교환안 중 하나 확정 → 다른 교환안 무효화.
- 이미 확정된 옷이 포함된 교환안 확정 시도 → `ClothingUnavailableError`, **아무것도 바뀌지 않음**(롤백 확인).
- **동시 확정:** 같은 옷을 공유한 두 교환안의 마지막 동의를 스레드 2개로 동시에 보냄 → 정확히 1개만 확정.

```python
def test_concurrent_confirm_only_one_wins(engine: Engine, two_proposals_sharing_clothing) -> None:
    p1, p2 = two_proposals_sharing_clothing
    barrier = threading.Barrier(2)
    def agree(p): barrier.wait(); return try_final_agree(engine, p)
    with ThreadPoolExecutor(2) as ex:
        results = list(ex.map(agree, [p1, p2]))
    assert sorted(results) == ["conflict", "confirmed"]
```

### 3. 취소·행사 종료 (services)

- 확정 교환 취소 → 교환 전체 취소, 관련 옷 다시 교환 가능.
- 종료된 행사에서 동의·확정·취소·의향 변경 → `EventClosedError`.
- 종료 시 미확정 교환안 취소, 확정 내역은 조회 가능.
- 행사 종료와 마지막 동의 동시 요청 → 종료 이후 확정이 생기지 않음.

### 4. 권한·계약 (api)

- 남의 옷 수정, 비당사자의 교환안 동의, 주최자 아닌 참가자의 행사 종료 → 403.
- 입장코드만으로 주최자 권한을 얻지 못함.
- 에러 응답이 공통 포맷(`{"error": {"code", "message", "details"}}`)을 따름 — 422·404·409·500 각 1개.
- AI fake가 예외를 던져도 수동 의류 목록 조회는 성공.

## 실행

- `uv run pytest`가 전부 통과해야 커밋한다. 실패하는 테스트를 `skip`으로 숨기는 것 **금지**(미구현이면 `xfail(reason=...)`로 명시).
- 커버리지 수치 목표는 두지 않는다. 위 우선 목록의 충족 여부로 판단한다.
