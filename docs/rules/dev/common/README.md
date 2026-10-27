# 공통 개발 규칙

Vintage Relay의 백엔드(FastAPI·SQLite)와 프론트엔드(Next.js·TypeScript·Tailwind CSS)가 함께 따르는 규칙이다. 해커톤 프로토타입이므로 실제로 지킬 수 있는 최소 규칙만 둔다.

## 읽기 범위

- **백엔드 작업:** `common/` + `backend/`만 읽는다.
- **프론트엔드 작업:** `common/` + `frontend/`만 읽는다.
- **API를 추가·변경하는 작업:** 위 범위에 더해 [api-contract.md](api-contract.md)를 반드시 확인한다.
- 다른 쪽(backend↔frontend) 규칙 문서는 읽지 않아도 된다. 양쪽이 공유해야 하는 내용은 모두 `common/`에 둔다.

## 규칙 표기

- **반드시:** 예외 없이 지킨다.
- **금지:** 하지 않는다.
- **권장:** 기본으로 따르되, 이유가 있으면 PR에 적고 벗어날 수 있다.

## 목차

| 문서 | 내용 |
|---|---|
| [tech-stack.md](tech-stack.md) | 버전 정책, 모노레포 구조, 패키지 매니저, 환경변수·비밀정보 |
| [code-style.md](code-style.md) | 언어 무관 코드 스타일(네이밍, 주석, 파일 크기, 매직넘버) |
| [api-contract.md](api-contract.md) | REST 규칙, JSON 케이스, 에러 포맷, 상태코드, 날짜·ID·페이지네이션 (**양측 단일 기준**) |
| [error-handling-logging.md](error-handling-logging.md) | 예외 처리와 로깅 원칙, 요청 ID |
| [git-commit.md](git-commit.md) | 커밋 메시지 규칙 |
| [git-workflow.md](git-workflow.md) | 브랜치, PR, 리뷰, 머지, 커밋 전 체크 |
| [testing.md](testing.md) | 공통 테스트 원칙 |

## 우선순위

1. 도메인·교환 규칙은 [AGENTS.md](../../../../AGENTS.md)와 [1차 개발 계획](../../../plans/vintage-relay-plan-v1.md)을 따른다.
2. 공통 규칙과 backend/frontend 규칙이 충돌하면 **공통 규칙(특히 api-contract.md)을 우선**하고, 충돌을 발견한 사람이 문서를 고친다.
3. 미정 사항(인증·세션 복원, 사진 보관 등)을 이 문서들에서 확정된 것처럼 다루지 않는다.
