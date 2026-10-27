# 커밋 메시지 규칙

[Conventional Commits](https://www.conventionalcommits.org/) 형식을 따른다.

## 1. 형식

```text
type(scope): subject

본문(선택)

꼬리말(선택)
```

- **반드시** `type`과 `scope`는 아래 목록의 영어 소문자.
- **반드시** 콜론 뒤에 공백 한 칸. (기존 첫 커밋 `docs(docs):first commit`은 공백이 빠진 예외이며 이후에는 `docs(docs): first commit` 형식을 쓴다.)
- **반드시** `subject`는 **한국어를 기본**으로 한다(영어도 허용). 무엇을 했는지 50자 이내로, 마침표 없이.
- **권장:** 한국어 subject는 "~ 추가", "~ 수정"처럼 명사형으로 끝낸다.
- **권장:** 본문에는 "왜" 바꿨는지를 적는다. 한 줄 72자 내외에서 줄바꿈.
- **금지:** `update`, `fix bug`, `수정`, `wip`처럼 내용을 알 수 없는 subject.

## 2. type

| type | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변화 없는 구조 개선 |
| `docs` | 문서만 변경 |
| `test` | 테스트 추가·수정 |
| `style` | 포맷팅 등 동작 무관 변경 |
| `chore` | 빌드 설정, 의존성, 기타 잡무 |
| `perf` | 성능 개선 |

## 3. scope

| scope | 대상 |
|---|---|
| `backend` | `backend/` 전반 |
| `frontend` | `frontend/` 전반 |
| `api` | 백엔드·프론트엔드에 걸친 API 계약 변경 |
| `ai` | 모델 API 연동, 프롬프트 |
| `db` | 스키마, 마이그레이션 |
| `docs` | `docs/` 및 루트 문서 |
| `infra` | 배포, CI, 환경 설정 |
| `deps` | 의존성 추가·업데이트 |
| `repo` | 루트 설정(`.gitignore`, `.editorconfig` 등) |

- **반드시** scope는 하나만 쓴다. 여러 영역을 크게 건드리면 커밋을 나눈다. 나누기 어려운 API 계약 변경은 `api`를 쓴다.
- 새 scope가 필요하면 이 표에 먼저 추가한다.

## 4. 예시

```text
feat(backend): 행사 생성 API 추가
fix(frontend): 입장코드 입력 시 공백 처리 오류 수정
feat(api): 교환안 응답에 version 필드 추가
docs(docs): 공통 개발 규칙 추가
chore(deps): fastapi 패치 버전 업데이트
```

## 5. Breaking change

API 계약을 깨는 변경은 `!`를 붙이고 꼬리말에 내용을 적는다.

```text
feat(api)!: 의류 목록 응답을 items 객체로 변경

BREAKING CHANGE: GET /api/v1/events/{event_id}/clothing 응답이 배열에서 {items, nextCursor}로 바뀜
```

## 6. 커밋 단위

- **반드시** 한 커밋은 하나의 논리적 변경. 빌드가 깨진 상태로 커밋하지 않는다.
- **금지:** 비밀정보, `.env`, 빌드 산출물(`node_modules/`, `.next/`, `.venv/`, `__pycache__/`), 로컬 DB 파일(`*.db`, `*.sqlite3`) 커밋.
- PR이 squash 머지되므로 브랜치 안의 커밋은 다소 자잘해도 되지만, **PR 제목은 반드시 이 형식**을 따른다(squash 커밋 메시지가 된다).
