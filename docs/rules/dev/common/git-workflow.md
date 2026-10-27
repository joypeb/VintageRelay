# Git 작업 흐름

해커톤 기간에 맞춘 단순한 GitHub Flow를 쓴다. `main` 하나와 짧게 사는 작업 브랜치만 둔다.

## 1. 브랜치

- **반드시** `main`은 항상 실행·배포 가능한 상태로 유지한다.
- **금지:** `main`에 직접 push, force push. GitHub 브랜치 보호(직접 push 금지, PR 필수)를 켠다.
- **반드시** 모든 작업은 `main`에서 새 브랜치를 따서 한다.

| 접두사 | 용도 | 예 |
|---|---|---|
| `feature/` | 기능 추가 | `feature/backend-event-create` |
| `fix/` | 버그 수정 | `fix/frontend-entry-code-input` |
| `docs/` | 문서 | `docs/common-dev-rules` |
| `chore/` | 설정·의존성·배포 | `chore/infra-deploy-setup` |
| `refactor/` | 구조 개선 | `refactor/backend-cycle-finder` |

- **반드시** 브랜치 이름은 `접두사/영역-짧은-설명`, 영어 소문자 `kebab-case`. 영역은 [git-commit.md](git-commit.md)의 scope를 쓴다.
- **권장:** 브랜치는 하루 안에 머지할 크기로 만든다. 오래 살수록 충돌이 커진다.
- **권장:** 작업 중 `main`이 바뀌면 `git pull --rebase origin main`으로 자주 따라간다(push 전 개인 브랜치에서만).
- **반드시** 머지된 브랜치는 삭제한다.

## 2. 커밋 전 체크

커밋 또는 PR 전에 해당 영역의 체크를 통과시킨다. 정확한 명령은 backend/frontend 문서를 따른다.

| 영역 | 반드시 실행 | 예 |
|---|---|---|
| backend | 포맷, 린트, 타입 체크, 테스트 | `uv run ruff format`, `uv run ruff check`, `uv run mypy app`, `uv run pytest` |
| frontend | 린트, 타입 체크, 테스트 | `pnpm lint`, `pnpm typecheck`, `pnpm test` (PR 전 `pnpm build`) |
| docs | 링크·표 깨짐 육안 확인 | - |

- **금지:** 체크 실패 상태로 PR 머지. 테스트를 지우거나 skip해서 통과시키는 것도 금지.
- **반드시** `git diff --staged`로 비밀정보·디버그 코드·불필요 파일이 없는지 확인한다.

## 3. Pull Request

- **반드시** PR 제목은 커밋 규칙 형식(`type(scope): subject`). squash 커밋 메시지가 된다.
- **반드시** PR 설명에 아래 세 가지를 적는다.

```markdown
## 변경 내용
- 무엇을 바꿨는지

## 확인 방법
- 실행한 체크, 수동 확인 절차 (화면 변경은 모바일 스크린샷 첨부)

## 참고
- API 변경 여부, 관련 문서, 미정 사항
```

- **권장:** PR 하나는 300줄 이내 변경(lock 파일 제외). 백엔드와 프론트엔드는 가급적 PR을 나눈다.
- **반드시** API 계약이 바뀌면 설명에 "API 변경"을 적고 [api-contract.md](api-contract.md)를 같은 PR에서 갱신한다.
- **권장:** 작업 중 공유가 필요하면 Draft PR을 연다.

## 4. 리뷰

- **권장:** 머지 전 팀원 1명 승인. 시간이 급하면 체크 통과 후 셀프 머지를 허용하되, 머지 후 팀에 알린다.
- **반드시** 다음 변경은 셀프 머지 금지, 1명 이상 리뷰: API 계약, DB 스키마, 교환 확정·취소·동시성 로직, 인증·권한, 비밀정보 처리.
- **권장:** 리뷰는 정확성(교환 규칙 위반, 중복 확정 가능성) → 보안(권한, 민감정보) → 가독성 순으로 본다. 취향 문제는 막지 않는다.
- **권장:** 리뷰 요청 후 30분 내 응답을 목표로 한다.

## 5. 머지

- **반드시** **Squash and merge**로 머지한다. GitHub 설정에서 merge commit·rebase merge를 끈다.
- **반드시** 머지 직전 `main` 최신 상태 기준으로 체크가 통과해야 한다.
- **반드시** 머지 후 `main`이 깨지면 원인 PR 작성자가 즉시 고치거나 revert한다. 고치는 데 오래 걸리면 revert가 우선이다.
