# 프로젝트 구조

## 1. 최상위 배치

프론트엔드는 저장소 루트의 `frontend/` 디렉토리에 둔다(1차 제안). 소스는 `src/` 아래에 두고 경로 별칭은 `@/*` → `src/*` 하나만 쓴다.

```text
frontend/
├── src/
│   ├── app/              # 라우팅 전용 (page, layout, error, not-found, loading)
│   ├── components/
│   │   ├── ui/           # Astryx 컴포넌트를 조합한 도메인 무관 공통 UI (예: BottomTabBar)
│   │   └── <domain>/     # 도메인 컴포넌트 (event, item, preference, trade, suggestion)
│   ├── hooks/            # 공통 훅 (useEventId, useDisclosure 등). 쿼리 훅은 여기 두지 않는다
│   ├── lib/
│   │   ├── api/          # API 클라이언트, 에러 타입, 도메인별 요청 함수와 쿼리 훅
│   │   ├── utils/        # cn, format(날짜·상태 라벨) 등 순수 함수
│   │   └── env.ts        # 환경변수 읽기 단일 지점
│   ├── types/            # API 응답·도메인 타입
│   ├── styles/globals.css  # Astryx·Tailwind 레이어 순서와 import
│   └── astryx-themes.ts    # `astryx theme add` 가 생성. 직접 수정 금지
├── public/
└── tests/e2e/            # Playwright (필요 시)
```

- **반드시:** `app/` 에는 라우팅 파일만 둔다. 화면 본문은 `components/<domain>/` 의 컴포넌트로 분리하고 `page.tsx` 는 조립만 한다.
- **반드시:** 한 도메인에서만 쓰는 컴포넌트는 해당 도메인 폴더에 둔다. 두 도메인 이상에서 쓰이면 `components/ui/` 로 옮긴다.
- **금지:** `utils.ts`, `helpers.ts` 같은 잡동사니 파일. 목적별로 파일을 나눈다.
- **권장:** 테스트 파일은 대상 옆에 `*.test.ts(x)` 로 둔다.

## 2. 라우팅 구조

[화면 흐름](../../../flows/screen-flow-v1.md)의 화면 ID와 경로를 아래처럼 대응한다. 경로는 1차 제안이며 화면 흐름이 바뀌면 이 표를 함께 갱신한다.

```text
src/app/
├── page.tsx                                   S0 랜딩
├── events/new/page.tsx                        H1 행사 생성
├── join/page.tsx                              P1 입장 (?code= 로 QR 자동 입력)
└── events/[eventId]/
    ├── layout.tsx                             행사 컨텍스트, 종료 배너
    ├── created/page.tsx                       H2 생성 완료·공유 (하단 탭 없음)
    └── (tabs)/
        ├── layout.tsx                         하단 탭: 홈 | 둘러보기 | 내 옷 | 교환
        ├── page.tsx                           P2 홈
        ├── manage/page.tsx                    M1 행사 관리 (H3는 모달 컴포넌트)
        ├── browse/page.tsx                    B1 AI 추천 / B2 전체 목록 (?view=all)
        ├── browse/[itemId]/page.tsx           B3 의류 상세 (I1은 바텀시트 컴포넌트)
        ├── preferences/page.tsx               R1 취향 입력
        ├── preferences/review/page.tsx        R2 취향 해석 확인
        ├── my-items/page.tsx                  C1 내 옷 목록
        ├── my-items/new/page.tsx              C2 옷 등록
        ├── my-items/[itemId]/page.tsx         C4 내 옷 상세
        ├── my-items/[itemId]/edit/page.tsx    C2 옷 수정
        ├── my-items/[itemId]/analysis/page.tsx C3 AI 분석 확인
        ├── trades/page.tsx                    T1 교환 목록 (?tab=intents|active|confirmed|history)
        ├── trades/[tradeId]/page.tsx          T2 동의 대기 / T3 확정 (상태로 분기)
        └── suggestions/[suggestionId]/page.tsx A1 대체 의류 제안
```

- **반드시:** 세그먼트 전환(B1/B2, T1 탭)은 별도 경로가 아니라 쿼리 파라미터로 처리해 뒤로 가기·공유가 자연스럽게 동작하게 한다.
- **반드시:** 모달·바텀시트(H3, I1, 확인 모달)는 경로를 만들지 않고 컴포넌트 상태로 연다.
- **반드시:** 주최자 전용 UI(M1 카드, 행사 종료)는 `participant.id === event.organizerParticipantId` 로만 노출을 판단한다. 이는 표시용이며 권한 검사는 서버 책임이다. (필드 이름 케이스는 공통 API 계약을 따른다.)
- **금지:** 주최자용 별도 앱·별도 라우트 트리.
- **권장:** 경로 문자열은 `lib/routes.ts` 의 함수로 만든다. `routes.trade(eventId, tradeId)` 처럼 쓰고 하드코딩 문자열을 흩뿌리지 않는다.

## 3. 서버 / 클라이언트 컴포넌트 구분

기본은 서버 컴포넌트다. 아래 중 하나라도 해당하면 클라이언트 컴포넌트(`'use client'`)로 만든다.

- 상태·이펙트 훅(`useState`, `useEffect`, TanStack Query 훅)을 쓴다.
- 이벤트 핸들러(`onClick`, `onSubmit`)가 있다.
- 브라우저 API(`localStorage`, 카메라 입력, 클립보드, `navigator`)를 쓴다.
- 참가자 세션에 의존하는 데이터를 조회한다(세션 방식이 미정이므로 1차 구현은 클라이언트에서 조회한다).

규칙:

- **반드시:** `'use client'` 경계는 가능한 한 잎(leaf) 컴포넌트에 둔다. `layout.tsx` 와 `page.tsx` 전체를 클라이언트로 만들지 않는다. 데이터가 필요한 화면 본문은 `components/<domain>/XxxScreen.tsx` 클라이언트 컴포넌트로 만들고 `page.tsx` 는 서버 컴포넌트로 남긴다.
- **반드시:** 서버 컴포넌트에서 클라이언트 컴포넌트로 넘기는 props는 직렬화 가능한 값만 쓴다(함수, Date 객체, 클래스 인스턴스 금지).
- **금지:** 서버 전용 비밀값을 다루는 코드. 프론트에는 비밀값이 없다(Meta Model API 키 등은 백엔드 서버만 가진다).
- **권장:** 동적 세그먼트 `params`, `searchParams` 는 Next.js 16에서 Promise이므로 서버 컴포넌트에서 `await` 해서 클라이언트 컴포넌트에 문자열로 넘긴다.

```tsx
// src/app/events/[eventId]/(tabs)/trades/[tradeId]/page.tsx (서버 컴포넌트)
import { TradeDetailScreen } from '@/components/trade/TradeDetailScreen';

export default async function TradePage({
  params,
}: {
  params: Promise<{ eventId: string; tradeId: string }>;
}) {
  const { eventId, tradeId } = await params;
  return <TradeDetailScreen eventId={eventId} tradeId={tradeId} />;
}
```

## 4. 미정 사항에 따른 구조

세션 복원·인증 방식이 정해지지 않았다. 세션 값 읽기·쓰기는 `lib/session.ts` 한 곳에만 두고, 다른 코드는 이 모듈의 함수만 호출한다. 방식이 정해지면 이 파일만 바꾼다.
