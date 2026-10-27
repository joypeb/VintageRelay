# AI 연동

Meta Model API(`muse-spark-1.3` 우선 검토)를 서버에서 호출한다. 모델 접근 가능 여부와 구조화 출력 지원은 아직 검증 전이다. AI 역할 범위는 [AGENTS.md](../../../../AGENTS.md)의 "AI와 시스템 책임"을 따른다.

## 격리

- 외부 호출은 `app/ai/client.py`에만 둔다. 라우터·리포지토리·`domain`에서 AI 호출 **금지**. 서비스만 AI 클라이언트를 사용한다.
- 클라이언트는 프로토콜(인터페이스)로 정의하고 의존성으로 주입한다. 테스트와 데모 비상용 fake 구현을 함께 둔다.
- API 키는 환경 변수(`pydantic-settings`, `SecretStr`)로만 읽는다. 코드·로그·응답·프론트엔드 노출 **금지**.
- AI 호출 중 DB 트랜잭션을 열어 두는 것 **금지**: 읽기 트랜잭션 종료 → AI 호출 → 새 트랜잭션에서 결과 저장(→ [database.md](database.md#트랜잭션)).

## 타임아웃·재시도

- `httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))`처럼 타임아웃을 **반드시** 명시한다. 값은 설정으로 뺀다.
- 재시도는 연결 오류·429·5xx에 한해 **최대 1회**, 짧은 대기(1초) 후. 4xx(요청 오류)는 재시도하지 않는다.
- 최종 실패는 `AIUnavailableError`(503)로 변환하고 `WARNING` 로그를 남긴다. 화면은 수동 선택으로 전환할 수 있어야 한다.
- **반드시** 동시 AI 호출 수를 제한한다(`threading.BoundedSemaphore`, 기본 4, 설정값). AI는 동기 호출이라 FastAPI 스레드풀(기본 40)을 점유한다. 제한이 없으면 AI 요청이 몰릴 때 스레드가 고갈되어 폴링·동의 등 **모든 요청이 함께 멈춘다**.
- 세마포어 획득은 짧게 기다리고(기본 2초) 실패하면 즉시 `AIUnavailableError`(503)로 응답해 수동 선택으로 넘긴다. 대기열을 길게 두는 것은 **금지**.

```python
_ai_slots = threading.BoundedSemaphore(settings.ai_max_concurrency)

def call_model(self, req: AiRequest) -> AiResponse:
    if not _ai_slots.acquire(timeout=settings.ai_slot_wait_seconds):
        raise AIUnavailableError("AI 요청이 많아 잠시 후 다시 시도해 주세요.")
    try:
        return self._post_with_retry(req)
    finally:
        _ai_slots.release()
```

- 응답은 Pydantic 모델(`ai/schemas.py`)로 검증한다. 파싱 실패도 AI 실패로 취급한다. 검증 안 된 dict를 서비스로 넘기는 것 **금지**.

## AI 결과의 책임 범위

- AI 결과로 `exchange_intents`·교환안 동의·대체 의류 수락을 생성하거나 변경하는 것 **금지**. 이 값들은 참가자의 명시적 요청(API 호출)으로만 바뀐다.
- AI 분석 결과는 추정값 컬럼(`features`, `interpreted_conditions`)에만 저장하고, 참가자가 확인한 값(`confirmed_*`)을 덮어쓰지 않는다.
- AI가 추천한 의류는 응답 전에 서버가 같은 행사 소속·교환 가능 상태를 **반드시** 다시 확인하고, 아니면 제외한다.
- **반드시** 분석 결과는 요청 당시의 `content_version`(취향은 `version`)과 함께 저장하고, 저장 트랜잭션 안에서 현재 버전과 비교한다. AI 호출 중 사진·설명·취향이 바뀌었으면 결과를 `stale`로 저장하거나 버리고, 최신 결과로 표시하지 않는다.

```python
# AI 호출 전(읽기 트랜잭션): v = clothing.content_version
# AI 호출 후(쓰기 트랜잭션):
current = db.scalar(select(Clothing.content_version).where(Clothing.id == clothing_id))
status = AnalysisStatus.DONE if current == v else AnalysisStatus.STALE
```

- 참가자가 확인한 값(`confirmed_*`)이 이미 있으면 새 분석 결과로 덮어쓰지 않는다. 같은 버전에 대한 분석 요청이 동시에 두 번 오면 나중 결과가 앞선 결과를 덮어써도 되지만, `confirmed_*`는 건드리지 않는다.
- 프롬프트에 "사진으로 확인할 수 없는 하자·핏·정품·가격은 확인 필요로 표시"를 포함한다. "확인되지 않음"을 "없음"으로 저장하지 않는다.
- 순환 탐색과 대체 의류 감지는 AI가 아닌 `domain/matching.py`가 처리한다.
