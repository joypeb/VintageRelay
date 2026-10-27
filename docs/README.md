# 문서 디렉토리 구조 (docs)

Vintage Relay 프로젝트의 기획, 도메인 지식, 비즈니스 규칙, 개발 설계 및 사용자 흐름 문서가 보관되는 공간입니다.

## 디렉토리 안내

- **`domain/`**: 프로젝트 배경, 도메인 지식, 초기 기획 및 아이디어 문서
  - [`idea.md`](domain/idea.md): 기획 근거, 문제 정의 및 아이디어 탐색 문서
- **`rules/`**: 비즈니스 정책, 핵심 교환 규칙, 시스템 제약 사항 문서 (지속 확장 예정)
  - [`dev/`](rules/dev/): 개발 규칙 — `common/`(공통·git), `backend/`(FastAPI·SQLite), `frontend/`(Next.js·TS·Tailwind)
- **`plans/`**: 개발 계획, 시스템 및 데이터베이스 아키텍처 명세
  - [`vintage-relay-plan-v1.md`](plans/vintage-relay-plan-v1.md): 1차 개발 계획, 핵심 흐름 및 기술 스펙 초안
  - [`database-design-v1.md`](plans/database-design-v1.md): 데이터베이스 테이블 설계 초안
- **`flows/`**: 화면 흐름 및 UI/UX 인터랙션 설계
  - [`screen-flow-v1.md`](flows/screen-flow-v1.md): 모바일 화면 흐름 명세 초안
  - [`mockup-flow-v1.html`](flows/mockup-flow-v1.html): 모바일 화면 흐름 인터랙티브 목업
