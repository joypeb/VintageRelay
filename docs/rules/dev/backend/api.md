# API 규칙

경로 네이밍, 에러 응답 포맷, JSON 케이스, 날짜 형식 등 프론트엔드와의 계약은 [../common/api-contract.md](../common/api-contract.md)를 따른다. 이 문서는 FastAPI 쪽 구현 규칙만 다룬다. 실제 API 경로와 요청·응답 상세는 아직 미정이다.

## 라우터

- 리소스별로 `APIRouter`를 하나씩 두고 `prefix`와 `tags`를 지정한다. 모든 라우터는 `/api/v1` 아래에 마운트한다.
- 라우트 함수는 **얇게** 유지한다: 의존성 받기 → 서비스 호출 → 결과 반환. 10줄을 넘으면 서비스로 옮긴다.
- 모든 라우트에 응답 모델을 **반드시** 지정한다(반환 타입 힌트 또는 `response_model`). `dict`·ORM 객체 반환 **금지**.
- 생성은 `status_code=201`, 본문 없는 성공은 `204`를 명시한다.
- 라우터에서 `HTTPException`을 직접 던지는 것은 **금지**. 도메인 예외를 던지고 전역 핸들러가 변환한다(→ [error-handling.md](error-handling.md)).

```python
router = APIRouter(prefix="/events/{event_id}/clothes", tags=["clothes"])

@router.post("", status_code=201)
def create_clothing(
    body: ClothingCreate,
    me: CurrentParticipant,
    service: ClothingServiceDep,
) -> ClothingRead:
    return service.create(me, body)
```

## 의존성 주입

`api/deps.py`에 모으고 `Annotated` 별칭으로 노출한다.

```python
DbSession = Annotated[Db, Depends(get_db)]   # read()/write() 제공 (database.md)
CurrentParticipant = Annotated[Participant, Depends(get_current_participant)]
Organizer = Annotated[Participant, Depends(require_organizer)]

def get_clothing_service(db: DbSession) -> ClothingService:
    return ClothingService(db)

ClothingServiceDep = Annotated[ClothingService, Depends(get_clothing_service)]
```

- `get_db`는 요청당 `Db` 1개를 제공한다. 트랜잭션은 서비스가 `with db.read()` 또는 `with db.write()`로 연다(→ [database.md](database.md#트랜잭션)).
- 설정(`Settings`)·AI 클라이언트도 의존성으로 주입해 테스트에서 `app.dependency_overrides`로 교체할 수 있게 한다.
- 모듈 전역 상태(전역 세션, 전역 캐시 dict) **금지**.

## 권한 검사 위치

입장코드·QR은 **행사 입장 수단일 뿐** 참가자·주최자 권한이 아니다. 인증·세션 방식은 미정이므로 판별 로직은 `deps.py` 한 곳에 격리한다.

| 검사 | 위치 | 예 |
|---|---|---|
| 누가 요청했는가(세션 → 참가자) | `deps.get_current_participant` | 세션 없음 → 401 |
| 경로의 행사에 속한 참가자인가 | `deps.get_current_participant` | 다른 행사 참가자 → 403 |
| 주최자인가 | `deps.require_organizer` | `event.organizer_participant_id != me.id` → 403 |
| 이 옷·의향의 소유자인가 | 서비스 | 남의 옷 수정 → 403 |
| 이 교환안의 당사자인가 | 서비스 | 교환안 동의·취소 |
| 행사가 진행 중인가 | 서비스(쓰기 트랜잭션 안) | 종료된 행사 → 409 |

- 경로의 `event_id`와 세션 참가자의 `event_id` 일치 검사는 **반드시** 의존성에서 한다.
- 리소스 소유권과 행사 상태 검사는 데이터를 읽어야 하므로 **서비스에서**, 그리고 쓰기 작업이면 같은 트랜잭션 안에서 한다. 라우터에서 미리 검사하고 서비스에서 다시 안 하는 것은 **금지**(경쟁 조건).
- 서비스 메서드는 첫 인자로 행위자(`actor: Participant`)를 받는다. 행위자 없이 쓰기 작업을 하는 서비스 메서드는 **금지**.
- 세션 구현이 정해지기 전 임시 방식(예: 서명된 쿠키, 헤더 토큰)을 쓰면 `deps.py`에만 두고 `# TODO(미정): 인증 방식` 주석을 단다.

## 요청·응답

- 목록 응답 형식은 공통 계약을 따른다. 공통 규칙에 정의가 없으면 배열을 바로 반환하지 않고 객체로 감싼다(`{"items": [...]}`). 페이지네이션은 필요해질 때 추가한다.
- 응답에 다른 참가자의 세션 토큰·내부 경로 등 민감 정보를 넣는 것은 **금지**. 주최자 여부 등 화면에 필요한 값만 담는다.
- 교환안 응답에는 `version`과 참가자별 제공·수령 의류를 **반드시** 포함한다. 동의 요청은 이 `version`을 그대로 보내고, 서버는 현재 버전과 다르면 409로 거절한다.
- 동의·거절·취소·행사 종료·의향 등록은 공통 계약의 중복 처리 표([../common/api-contract.md](../common/api-contract.md) 5-1)대로 **반드시** 멱등하게 구현한다. "이미 목표 상태인지"는 쓰기 트랜잭션 안에서 판단한다.

### 대체 의류 제안 수락

제안은 저장하지 않고 요청 시 계산하므로, 제안을 본 뒤 다른 참가자의 의향·의류가 바뀌었을 수 있다.

- **반드시** 수락 요청은 `intentId`, 현재 제공 의류 `fromClothingId`, 바꿀 의류 `toClothingId`를 보낸다.
- **반드시** 서버는 하나의 쓰기 트랜잭션 안에서 다음을 모두 확인한 뒤 의향을 바꾼다. 하나라도 실패하면 의향을 바꾸지 않고 409로 응답한다(프론트엔드는 제안 목록을 다시 불러온다).
  1. 행사 진행 중, 의향이 본인 것이고 유효하며 현재 제공 의류가 `fromClothingId`와 같음
  2. `toClothingId`가 본인 소유이고 교환 가능 상태
  3. 바꾼 의향으로 **지금** 2인·3인 순환이 닫힘(`domain/matching.py`로 재계산)
- 의향 변경 후 같은 트랜잭션에서 영향받는 미확정 교환안을 무효화하고 교환안을 다시 계산한다([database.md](database.md#교환안-생성과-중복-방지)).
- 수락은 최종 동의가 아니다. 새로 생긴 교환안은 동의 대기 상태로 시작한다.
- 사진 업로드는 `UploadFile`로 받고 MIME 타입(`image/jpeg`, `image/png`, `image/webp`)과 크기 상한(설정값, 기본 10MB)을 **반드시** 검사한다. 저장 파일명은 서버가 생성(UUID)하고 원본 파일명을 경로에 쓰지 않는다.
- OpenAPI 문서(`/docs`)는 개발·데모 중 켜 둔다. 라우트에 `summary`를 달아 프론트엔드가 참고할 수 있게 한다(권장).
