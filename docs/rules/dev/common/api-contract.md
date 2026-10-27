# API 계약 (백엔드·프론트엔드 단일 기준)

백엔드와 프론트엔드가 HTTP로 주고받는 형식의 **유일한 기준 문서**다. backend/frontend 문서와 충돌하면 이 문서를 따른다. 기능별 경로와 요청·응답 상세는 아직 미정이며, 정해지면 이 규칙에 맞춰 작성한다.

## 1. 기본 규칙

- **반드시** 모든 API는 `/api/v1` 아래에 둔다.
- **반드시** 요청·응답 본문은 JSON(`Content-Type: application/json; charset=utf-8`). 사진 업로드만 `multipart/form-data`를 쓴다.
- **반드시** 응답 스키마는 FastAPI의 OpenAPI 문서(`/docs`, `/openapi.json`)에 드러나야 한다. 프론트엔드는 이를 기준으로 타입을 만든다.
- **금지:** 문서화되지 않은 필드를 응답에 몰래 추가해 프론트엔드가 의존하게 하는 것.

## 2. URL과 메서드

- **반드시** 경로는 소문자 `kebab-case`, 리소스는 복수 명사. 예: `/api/v1/events/{event_id}/clothing`, `/api/v1/proposals/{proposal_id}/consents`
- **반드시** 행사 소속 리소스는 행사 아래에 중첩한다. 중첩은 2단계까지만.
- **반드시** CRUD는 메서드로 표현한다.

| 메서드 | 용도 |
|---|---|
| `GET` | 조회. 부수효과 금지. |
| `POST` | 생성, 또는 아래의 상태 전이 액션 |
| `PATCH` | 일부 수정 |
| `DELETE` | 삭제·철회 |

- **허용:** CRUD로 표현하기 어려운 상태 전이는 `POST /리소스/{id}/동사` 액션 경로를 쓴다. 예: `POST /api/v1/events/{event_id}/close`, `POST /api/v1/proposals/{proposal_id}/cancel`
- **금지:** `PUT` 사용(전체 교체가 필요한 경우가 없으므로 `PATCH`로 통일).
- **금지:** 경로에 동사 남발(`/getEvent`, `/createClothing`).

## 3. JSON 필드 케이스 (결정)

**API JSON은 `camelCase`로 통일한다.**

- **반드시** 요청·응답 JSON 키, 쿼리 파라미터는 `camelCase`. 예: `organizerParticipantId`, `createdAt`, `?eventId=...`
- **반드시** 백엔드는 Python 내부와 DB에서 `snake_case`를 유지하고, Pydantic 공통 베이스 모델에서 alias로 변환한다. 필드마다 수동 alias를 달지 않는다.
- **반드시** 프론트엔드는 받은 JSON을 그대로 쓴다. 별도 케이스 변환 라이브러리·코드를 두지 않는다.
- 경로 변수 이름(`{event_id}`)은 URL 문자열에 노출되지 않으므로 백엔드 관례대로 둔다.

```python
# backend: 공통 베이스 모델
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
```

FastAPI 라우트는 기본적으로 alias(`camelCase`)로 직렬화한다. 이 동작을 끄는 설정(`response_model_by_alias=False`)은 **금지**.

## 4. 값 형식

### ID

- **반드시** API에서 모든 ID는 **문자열**로 주고받는다. 클라이언트는 ID를 해석·계산하지 않는다(불투명 값).
- **권장:** 백엔드는 UUID v4(소문자, 하이픈 포함)를 쓴다. 순차 정수는 다른 행사·참가자 ID를 추측하기 쉬우므로 외부에 노출하지 않는다.
- 입장코드(`entryCode`)는 ID가 아니며 사람이 입력하는 별도 값이다.

### 날짜·시간

- **반드시** UTC, ISO 8601, `Z` 접미사. 예: `"2026-10-27T05:30:00Z"` (밀리초는 선택)
- **반드시** 필드명은 시점이면 `~At` (`createdAt`, `confirmedAt`, `closedAt`), 날짜만이면 `~Date`.
- **반드시** 한국 시간 변환은 프론트엔드가 화면 표시 시점에만 한다. 백엔드는 현지 시간 문자열을 반환하지 않는다.
- **금지:** Unix timestamp 숫자, 타임존 없는 시간 문자열.

### enum·불리언·null

- **반드시** enum 값은 소문자 `snake_case` 문자열. 예: `"active"`, `"closed"`, `"pending"`, `"confirmed"`, `"cancelled"`
- **반드시** 불리언은 `is`/`has`/`can` 접두사. 예: `isOrganizer`, `canCancel`
- **반드시** 응답 스키마에 정의된 필드는 값이 없어도 생략하지 않고 `null`로 보낸다.
- **반드시** 빈 목록은 `null`이 아닌 `[]`.

## 5. 응답 형태

- **반드시** 단건 응답은 리소스 객체를 그대로 반환한다(`data` 래퍼 없음).
- **반드시** 목록 응답은 배열이 아닌 객체로 감싼다. 이후 페이지네이션 추가 시 형식이 깨지지 않게 하기 위함이다.

```json
{ "items": [ { "id": "3f1c...", "status": "available" } ], "nextCursor": null }
```

## 5-1. 상태 전이 요청의 중복 처리 (결정)

모바일 환경에서는 버튼 연타·네트워크 재전송으로 같은 요청이 두 번 올 수 있다. 상태 전이 액션은 아래 표대로 응답한다.

| 요청 | 이미 목표 상태일 때 | 다른 상태로 바뀌었을 때 |
|---|---|---|
| 교환안 동의 (`proposalId`, `version`) | 같은 버전에 이미 동의했으면 **200 + 현재 교환안** (상태 변경 없음) | 무효·거절·확정 후 버전 다름 → 409 `PROPOSAL_VERSION_MISMATCH` |
| 교환안 거절 | 이미 거절했으면 200 + 현재 교환안 | 이미 확정·무효 → 409 `PROPOSAL_VERSION_MISMATCH` |
| 확정 교환 취소 | 이미 취소됐으면(다른 당사자가 먼저 취소 포함) **200 + 취소된 교환안** | 행사 종료 → 409 `EVENT_CLOSED` |
| 행사 종료 | 이미 종료됐으면 200 + 행사 | - |
| 의향 등록 | 같은 (제공 의류, 희망 의류) 유효 의향이 있으면 200 + 기존 의향 (새로 만들지 않음) | 의류가 교환 불가 → 409 `CLOTHING_ALREADY_CONFIRMED` |

- **반드시** 위 요청은 같은 요청을 여러 번 보내도 결과가 한 번 보낸 것과 같아야 한다(멱등). 중복 행·중복 로그·이중 상태 변경 **금지**.
- **반드시** 응답 본문에는 처리 후 **현재 상태**를 담는다. 프론트엔드는 응답으로 화면을 갱신하고, 200을 받았다고 "내 요청이 상태를 바꿨다"고 가정하지 않는다.
- 프론트엔드는 이 요청들을 자동 재시도하지 않는다. 멱등 처리는 연타·재전송에 대한 서버 측 안전장치다.

## 6. 페이지네이션

- 행사 단위 데이터는 작으므로 **기본은 페이지네이션 없이 전체 반환**한다(`nextCursor`는 항상 `null`).
- 필요해지면 커서 방식으로만 추가한다: 요청 `?limit=20&cursor=<불투명 문자열>`, 응답 `nextCursor`가 `null`이면 마지막 페이지.
- **금지:** `page`/`offset` 방식 혼용.

## 7. 에러 응답 포맷 (결정)

**모든 4xx·5xx 응답은 아래 형식 하나만 쓴다.**

```json
{
  "error": {
    "code": "CLOTHING_ALREADY_CONFIRMED",
    "message": "이미 다른 교환에 확정된 옷이에요.",
    "details": { "clothingId": "3f1c..." },
    "requestId": "b7e2..."
  }
}
```

| 필드 | 규칙 |
|---|---|
| `code` | **반드시** `UPPER_SNAKE_CASE` 영문. 프론트엔드 분기의 유일한 기준. 한 번 쓴 코드의 의미를 바꾸지 않는다. |
| `message` | **반드시** 사용자에게 그대로 보여줘도 되는 한국어 문장. 스택트레이스·SQL·내부 경로 **금지**. |
| `details` | 선택. 객체 또는 `null`. 검증 에러는 `{"fields": [{"field": "title", "reason": "required"}]}` 형식(`field`는 camelCase). |
| `requestId` | **반드시** 포함. 응답 헤더 `X-Request-ID`와 같은 값. |

- **반드시** FastAPI 기본 에러(`{"detail": ...}`)와 요청 검증 에러도 이 형식으로 변환한다.
- **금지:** 프론트엔드가 `message` 문자열을 비교해 분기하는 것. `code`만 쓴다.
- **반드시** 새 에러 코드는 백엔드 코드의 한 곳(enum/상수)에 모아 정의한다.

공통 에러 코드(기능별 코드는 필요할 때 추가):

| code | 상태 | 의미 |
|---|---|---|
| `VALIDATION_ERROR` | 422 | 요청 값 검증 실패 |
| `BAD_REQUEST` | 400 | 형식이 잘못된 요청(JSON 파싱 불가 등) |
| `UNAUTHENTICATED` | 401 | 참가자 세션 없음·만료 |
| `FORBIDDEN` | 403 | 권한 없음(남의 의류 수정, 주최자 아닌 사람의 종료 등) |
| `NOT_FOUND` | 404 | 리소스 없음, 또는 다른 행사 리소스 접근 |
| `EVENT_CLOSED` | 409 | 종료된 행사에서 변경 시도 |
| `PROPOSAL_VERSION_MISMATCH` | 409 | 무효가 된 교환안 버전에 동의 시도 |
| `CLOTHING_ALREADY_CONFIRMED` | 409 | 다른 교환에 확정된 옷 사용 |
| `FILE_TOO_LARGE` | 413 | 업로드 사진 용량 초과 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | 허용하지 않는 파일 형식 |
| `AI_UNAVAILABLE` | 503 | 모델 API 오류·지연. 프론트엔드는 수동 선택으로 안내한다. |
| `INTERNAL_ERROR` | 500 | 예상하지 못한 서버 오류 |

## 8. HTTP 상태코드 기준

| 코드 | 사용 |
|---|---|
| `200 OK` | 조회, 수정, 액션 성공(결과 본문 반환) |
| `201 Created` | 생성 성공. 생성된 리소스를 본문에 반환 |
| `204 No Content` | 삭제 성공, 반환할 본문 없음 |
| `400` | 파싱 불가 등 형식 오류 |
| `401` / `403` | 인증 없음 / 인증됐지만 권한 없음 |
| `404` | 없는 리소스. **다른 행사 리소스 접근도 404**로 응답해 존재 여부를 노출하지 않는다. |
| `409 Conflict` | 현재 상태와 충돌(행사 종료, 버전 불일치, 중복 확정) |
| `413` / `415` | 업로드 용량·형식 오류 |
| `422` | 요청 값 검증 실패 |
| `500` | 서버 버그 |
| `503` | 외부 의존(모델 API) 사용 불가 |

- **금지:** 에러를 `200`과 `{"success": false}`로 돌려주는 것.
- **금지:** 비즈니스 규칙 위반에 `500` 사용.

## 9. 헤더

- **반드시** 백엔드는 모든 응답에 `X-Request-ID`를 넣는다. 요청에 이 헤더가 있으면 그 값을 쓰고, 없으면 새로 만든다.
- **권장:** 프론트엔드는 에러 화면·콘솔에 `requestId`를 함께 남겨 디버깅에 쓴다.
- 인증·세션 전달 방식(쿠키 또는 헤더)은 미정이다. 정해지면 이 절에 추가한다.

## 10. 변경 절차

- **반드시** API 형식을 바꾸는 PR은 설명에 "API 변경"을 명시하고 백엔드·프론트엔드 담당 모두에게 알린다.
- **금지:** 프론트엔드가 쓰는 필드를 예고 없이 이름 변경·삭제. 해커톤 중에는 `/api/v2`를 만들지 않고, 양쪽을 같은 PR 또는 연달아 수정한다.
