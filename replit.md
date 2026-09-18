# LingoLoop

한국어 사용자가 매일 10분 동안 영어 단어와 실생활 문장을 익히고 짧은 퀴즈로 복습하는 학습 웹앱입니다.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/english-learning/src/App.tsx` — 라우팅, 학습 상태, 주요 화면과 인터랙션
- `artifacts/english-learning/src/index.css` — 앱 전체 색상 토큰과 모션 스타일
- `artifacts/english-learning/package.json` — 프론트엔드 실행 및 빌드 설정
- `artifacts/api-server` — 공유 API 서버 스캐폴드 (현재 LingoLoop는 로컬 상태 기반으로 동작)

## Architecture decisions

- 첫 버전은 별도 계정이나 서버 저장 없이 로컬 React 상태로 핵심 학습 흐름을 빠르게 체험할 수 있도록 구성했습니다.
- Wouter의 평면 라우팅으로 오늘의 연습, 배우기, 단어장, 나의 기록 화면을 분리했습니다.
- 학습 상태는 단어 카드 뒤집기, 퀴즈 선택, 단어장 저장, 레벨 선택이 화면 간 이어지도록 상위 App 상태에서 관리합니다.

## Product

- 사용자는 Beginner, Intermediate, Advanced 레벨을 선택할 수 있습니다.
- 오늘의 단어 `serendipity`와 실생활 문장을 보고, 카드를 뒤집고, 발음을 듣고, 4지선다 퀴즈를 풀 수 있습니다.
- 학습한 단어를 단어장에 저장하고 삭제할 수 있으며, 스트릭·주간 학습 시간·완료 레슨을 확인할 수 있습니다.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
