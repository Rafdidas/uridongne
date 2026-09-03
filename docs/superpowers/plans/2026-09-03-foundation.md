# 초기 개발 환경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 사용자와 합의한 모델 전환 후 같은 작업에서 순서대로 실행한다. 서브에이전트 작업은 별도 요청이 없는 한 시작하지 않는다.

**Goal:** 사용자 스타일 토큰을 공유하는 Next.js 앱을 로컬에서 실행하고, Cloudflare 연결 전에 필요한 빌드 기반을 검증한다.

**Architecture:** Next.js App Router의 서버 페이지를 기본으로 하고 TanStack Query provider만 클라이언트 경계에 둔다. 스타일 상수의 단일 원본을 Tailwind와 JS가 공유하고 실제 팔레트는 CSS 변수로 관리한다. OpenNext는 계정 연결 없이 빌드 준비까지만 수행한다.

**Tech Stack:** Node.js 24 LTS, pnpm 10.30.3 기준, Next.js 16, React, TypeScript strict, Tailwind CSS 4, TanStack Query, OpenNext, Wrangler.

**Spec:** [초기 개발 환경 설계](../specs/2026-09-03-foundation-design.md). 실행 전에 [handoff.md](../../../handoff.md)와 함께 읽는다.

## Global Constraints

- 설계와 구현은 다른 AI 모델을 사용하며 코드 작성 직전에 모델 전환을 알린다.
- Node.js 24 LTS, Next.js 16 App Router, React, TypeScript strict, pnpm을 사용한다.
- Tailwind CSS 4를 사용한다. Emotion은 실제 필요가 생기고 호환성을 검증했을 때 추가한다.
- 사용자 제공 스타일 변수의 이름·브레이크포인트·크기·굵기·간격·모서리·그림자 값을 보존한다.
- 반투명한 둥근 표면을 기본 디자인으로 사용하고, 참고 사이트의 과도한 UI 크기는 가져오지 않는다.
- 사용자 기획안과 스타일 원본, handoff.md를 프로젝트 생성 중 보존한다.
- 동네로그는 가제다. 패키지·Worker의 기술용 이름과 서비스 표시 이름을 분리한다.
- GitHub 연결·푸시는 사용자가 요청할 때 진행한다. Cloudflare 계정 연결·리소스 생성·배포도 사용자가 요청할 때 진행한다.
- 의미 있는 단계마다 handoff.md를 갱신한다. GitHub 연결 후 README.md도 지속 갱신한다.
- 이 작업에서 실제 데이터를 조회한 것처럼 보이는 통계 수치를 제공하지 않는다.

---

## Task 1: 문서를 보존하며 실행 가능한 앱 생성

**Files:** package.json, pnpm-lock.yaml, .node-version, .npmrc, .gitignore, AGENTS.md, tsconfig.json, next.config.ts, next-env.d.ts, eslint.config.mjs, postcss.config.mjs, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, handoff.md.

**Interfaces:** 현재 저장소의 handoff 및 원본 문서를 입력으로 받는다. 이후 작업은 pnpm dev / lint / typecheck / build / start 명령과 @/* → src/* 경로를 사용한다.

- [ ] **1. 작업 전 상태와 설치 버전 확인.**

```text
git status --short
node --version
pnpm --version
pnpm view next@16 version --json
pnpm view next@16 peerDependencies --json
pnpm view @opennextjs/cloudflare engines peerDependencies --json
```

Git 저장소가 없다는 오류는 초기 현황으로 기록한다. Node 24 LTS 여부와 어댑터 요구를 확인한다. 레지스트리 조회가 실패하면 네트워크 문제를 기록하고 임의의 호환 버전을 만들어 적지 않는다. next@16 결과 중 최고 안정 버전을 선택하고 peer dependency에 맞는 react/react-dom 동일 버전을 선택한다.

- [ ] **2. 저장소 안의 새로운 임시 하위 폴더에서 템플릿 생성.**

```text
pnpm dlx create-next-app@16 scaffold-foundation --ts --tailwind --eslint --app --src-dir --use-pnpm --import-alias "@/*" --disable-git --skip-install
```

먼저 해당 폴더가 없는지 확인한다. 있으면 내용을 조사하고 새로운 비어 있는 하위 폴더를 사용한다. 생성된 소스와 설정만 루트로 복사하며 docs/, handoff.md와 기존 변경 파일을 덮어쓰지 않는다. package name은 uridongne-mvp, private=true로 정리한다. 생성기의 기본 React Compiler 등 추가 선택은 이 단계에서 비활성화한다. 템플릿 정리에서 재귀 삭제가 필요하면 절대 경로가 이 작업 폴더 안임을 먼저 확인하고 한 셸에서 수행한다.

- [ ] **3. 확정한 정확한 버전과 스크립트 저장 후 설치.**

선택한 버전은 package.json에 숫자로 적고 ^/~ 범위를 없앤다. pnpm-lock.yaml로 전이 의존성을 고정한다. packageManager는 pnpm@10.30.3이며 업데이트가 필요하면 근거를 기록한다. .npmrc 내용은 save-exact=true이다. .node-version에는 이번에 검증한 24 LTS 패치 버전을 적는다.

package.json scripts에는 다음을 포함한다.

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "next typegen && tsc --noEmit"
}
```

```text
pnpm install
```

루트 layout은 lang="ko"로 변경하고 원격 폰트 import를 제거한다. 타입의 strict=true와 @/* 별칭을 확인한다. 샘플 로고·외부 링크 대신 루트에 가제와 “동네 변화 데이터를 준비하고 있습니다.” 문구를 둔다. 검색·통계 기능이 완성된 것처럼 보이는 동작을 만들지 않는다.

- [ ] **4. 작업 인계 규칙 추가.**

AGENTS.md는 아래 내용으로 만든다. 기존 파일이 생겼다면 기존 지침을 보존하며 병합한다.

```markdown
# 프로젝트 작업 지침

- 작업을 시작할 때 handoff.md를 먼저 읽고 실제 파일·Git 상태와 비교한다.
- 설계와 코드 구현 전환 시 사용자에게 모델 전환 시점을 알린다.
- 주요 결정, 의미 있는 작업 완료, 검증, 중단 시 handoff.md의 현재 상태와 이력을 함께 갱신한다.
- GitHub 연결 및 Cloudflare 외부 작업은 사용자의 진행 요청을 확인한다.
- GitHub 연결 후 README.md의 설치·실행·배포 안내를 실제 구현 상태에 맞춰 유지한다.
- 사용자 원본 자료는 docs/references/에 보존한다.
- 비밀값은 문서와 저장소에 기록하지 않는다.
```

.gitignore에 node_modules/, .next/, .open-next/, .wrangler/, .env*, !.env.example, .dev.vars*, *.tsbuildinfo를 포함한다. 런타임에 필요한 비밀값이 없으므로 내용 없는 .env.example을 미리 만들 필요는 없다.

- [ ] **5. 기본 앱 검증 및 인계 기록.**

```text
pnpm lint
pnpm typecheck
pnpm build
```

세 명령의 실제 종료 결과를 기록한다. 지금 GitHub를 생성하거나 연결하지 않는다. Git 저장소가 생겼다면 상태를 기록하고 사용자가 작업 중인 내용을 선택 없이 함께 커밋하지 않는다. 사용자 원본 문서 2개가 그대로 남아 있는지 확인한다.

## Task 2: 공유 스타일 토큰과 개발용 확인 페이지

**Files:** src/styles/styleConstants.ts, src/styles/theme.css, src/styles/surfaces.css, tailwind.config.ts, src/app/globals.css, src/app/dev/styles/page.tsx, src/app/layout.tsx, handoff.md.

**Interfaces:** 원본 파일 docs/references/style-tokens.reference.txt의 모든 키와 수치를 입력으로 받는다. styleConstants.ts는 ScreenBreakpoints, StyleSpacing, StyleColors, StyleFontSize, StyleBoxShadow, StyleBorderRadius를 export한다. Tailwind와 향후 JS 기능은 이 exports를 사용한다.

- [ ] **1. 원본 토큰을 모듈로 이전.**

원본에서 screens, colors, boxShadow, fontSize, spacing, borderRadius 객체를 각각 위 exports로 옮긴다. gap은 별도 복제 없이 StyleSpacing을 참조한다. 예를 들어 브레이크포인트 원본은 다음과 같다.

```ts
export const ScreenBreakpoints = {
  sm: '480px',
  md: '768px',
  lg: '1200px',
  xl: '1440px',
  '2xl': '1920px',
} as const;
```

폰트 크기 객체에는 원본의 각 fontWeight와 설계서 5절의 lineHeight를 함께 둔다. 실제 색상 추가 토큰은 changeIncrease, changeDecrease, changeNeutral이며 CSS 참조는 각각 --change-increase, --change-decrease, --change-neutral이다. 사용자 추가 디자인 요청에 따라 canvas, surfaceGlass, surfaceGlassStrong, surfaceGlassFallback, outlineGlass와 card=20px, panel=24px, pill=9999px 반지름을 추가한다. 원본 xxs~xl은 보존한다. [디자인 참고 자료](../../references/design/direction.md)와 이미지 6장을 먼저 읽는다.

- [ ] **2. Tailwind 연결 작성.**

```ts
import type { Config } from 'tailwindcss';
import {
  ScreenBreakpoints, StyleSpacing, StyleColors,
  StyleFontSize, StyleBoxShadow, StyleBorderRadius,
} from './src/styles/styleConstants';

export default {
  theme: {
    screens: ScreenBreakpoints,
    extend: {
      colors: StyleColors,
      spacing: StyleSpacing,
      gap: StyleSpacing,
      fontSize: StyleFontSize,
      boxShadow: StyleBoxShadow,
      borderRadius: StyleBorderRadius,
    },
  },
} satisfies Config;
```

globals.css 시작은 다음과 같이 구성한다. theme.css는 일반 CSS이므로 실제 값과 CSS 변수만 둔다.

```css
@import "tailwindcss";
@import "../styles/theme.css";
@import "../styles/surfaces.css";
@config "../../tailwind.config.ts";
```

경로 주의: globals.css는 src/app/에 있으므로 루트 tailwind.config.ts까지는 ../../이다. 기본 브레이크포인트가 혼합되면 공식 Tailwind 4 테마 override 방식으로 기본 --breakpoint-*를 초기화하고 사용자 screens가 생성된 CSS에 들어가는지 확인한다. 기존 값 두 벌을 수동으로 관리하는 방식으로 고치지 않는다.

- [ ] **3. theme.css의 모든 참조 변수 정의.**

설계서 5절의 팔레트·단계·overlay 규칙을 전부 적용한다. StyleColors의 var(...)가 참조하는 이름 중 미정의 변수가 없어야 한다. 기본값은 다음과 같이 시작한다.

```css
:root {
  color-scheme: light;
  --primary: #0f766e;
  --on-primary: #ffffff;
  --surface: #ffffff;
  --on-surface: #0f172a;
  --outline: #cbd5e1;
  --transparent: transparent;
  --canvas: #eef1f6;
  --surface-glass: rgb(255 255 255 / 72%);
  --surface-glass-strong: rgb(255 255 255 / 90%);
  --surface-glass-fallback: #f8fafc;
  --outline-glass: rgb(255 255 255 / 65%);
  --blur-glass: 16px;
  --font-app: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
}
```

나머지 변수는 설계서에 명시된 팔레트 대응으로 같은 :root에 추가한다. on* 색상은 해당 배경과의 상대 휘도 대비로 선택한다. 대비 계산은 sRGB 각 채널을 0~1로 바꾸고, c<=.04045이면 c/12.92, 아니면 ((c+.055)/1.055)^2.4로 선형화한다. L=.2126R+.7152G+.0722B이고 비율은 (높은 L+.05)/(낮은 L+.05)이다. #0f172a와 #ffffff 중 비율이 큰 값을 쓰고 실사용 본문 조합 4.5 이상을 확인한다.

body는 margin=0, font-family=var(--font-app), font-size=16px, line-height=1.6, background-color=var(--canvas), color=var(--on-surface)로 설정한다. background-image에는 약한 파랑·코랄의 정적 radial-gradient를 사용한다. :focus-visible에는 primary 2px 외곽선과 3px offset을 둔다. 시스템의 reduced motion 설정을 존중하고 불필요한 애니메이션을 넣지 않는다.

surfaces.css에는 다음 표면 클래스를 둔다. gs1 그림자와 정확히 같은 값을 사용하는 연결로 정리하고, 텍스트까지 투명해지는 opacity는 사용하지 않는다.

```css
@layer components {
  .glass-panel {
    background: var(--surface-glass-fallback);
    border: 1px solid var(--outline-glass);
    box-shadow: 0px 1px 10px 1px rgb(0 0 0 / 3%);
  }
  .glass-inset { background: var(--surface-glass-strong); }
  @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .glass-panel {
      background: var(--surface-glass);
      -webkit-backdrop-filter: blur(var(--blur-glass));
      backdrop-filter: blur(var(--blur-glass));
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    .glass-panel, .glass-inset {
      background: var(--surface-glass-fallback);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
  @media (forced-colors: active) {
    .glass-panel, .glass-inset {
      background: Canvas;
      color: CanvasText;
      border: 1px solid CanvasText;
      box-shadow: none;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
}
```

- [ ] **4. 개발용 확인 화면 작성.**

서버 페이지 src/app/dev/styles/page.tsx 시작에서 production 접근을 차단한다.

```tsx
import { notFound } from 'next/navigation';

export const metadata = { robots: { index: false, follow: false } };

export default function StylesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="mx-auto max-w-[1200px] p-md md:p-lg">
      <h1 className="text-display-lg">기본 스타일 확인</h1>
      <p className="text-body-xl">디자인 검토용 예시이며 실제 동네 데이터가 아닙니다.</p>
      <section className="glass-panel mt-lg rounded-panel p-md">
        <label htmlFor="sample-search" className="text-label-md">검색 입력 예시</label>
        <input id="sample-search" type="search" placeholder="동네 이름" className="glass-inset mt-sm min-h-11 w-full rounded-pill border border-outline px-md text-body-xl" />
        <button type="button" className="mt-md min-h-11 rounded-pill bg-primary px-md py-sm text-label-md text-onPrimary">기본 버튼</button>
      </section>
    </main>
  );
}
```

반환하는 main 안에 모든 원본 색상의 CSS 변수 견본과 이름, 각 글자 스타일, 간격·그림자·모서리 견본을 추가한다. 값 표시는 constants에서 읽고, 색상 견본은 style={{background: cssVariable}}로 설정한다. Tailwind 조합 확인용 text-body-xl, bg-primaryLow 등의 클래스는 완성된 문자열로 작성한다. type=button은 데이터 조회나 제출을 하지 않는 예시다.

첫 화면에 title-md/lg, display-sm/lg를 사용한 실제 크기의 예시 변화 카드와 작은 정적 그래프를 둔다. 예시 표시를 유지하고 차트 라이브러리는 이 검토용 그림을 위해 설치하지 않는다. 바깥 패널에만 블러를 적용하고 내부 정보 카드에는 glass-inset rounded-card를 사용한다. 불투명 대체 모습도 별도 견본으로 보여준다. 기본 카드 padding=16px, 카드 간격=16px, 큰 패널만 padding=24px로 유지한다.

반응형 확인용 요소 하나는 다음과 같이 단계별 padding을 바꾼다.

```tsx
<div data-breakpoint-probe className="p-xxs sm:p-xs md:p-sm lg:p-md xl:p-lg 2xl:p-xl">
  반응형 간격 확인
</div>
```

- [ ] **5. 실제 CSS·브라우저 검증.**

개발 서버에서 /dev/styles를 열고 원본의 모든 참조 변수가 값으로 해석되는지 확인한다. 빈 값·투명으로 잘못 나오는 견본이 있으면 수정한다. breakpoint probe의 computed padding은 479px=2, 480px=4, 767px=4, 768px=8, 1199px=8, 1200px=16, 1439px=16, 1440px=24, 1919px=24, 1920px=32px여야 한다. 360px에서 가로 넘침과 키보드 포커스, 한국어 줄바꿈을 확인한다. 이 검증은 브라우저 스킬의 실제 computed style/화면 관찰로 수행하고 소스 문자열만 검사하는 테스트로 대체하지 않는다.

```text
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

production에서 루트는 정상 표시, /dev/styles는 HTTP 404인지 확인한다. 결과와 확인한 화면 크기를 handoff.md에 기록한다.

유리 표면은 색 번짐과 합성된 배경에서 본문 대비를 검사한다. 배경 흐림을 끈 상태, 투명도 감소·강제 색상 환경에서도 숫자와 조작 요소가 읽히는지 확인한다. 모든 카드와 셀에 중복된 블러가 없는지, 모바일 스크롤이 방해받지 않는지 확인한다. 이미지의 큰 UI를 그대로 확대 적용하지 않았는지도 시각 검토에 포함한다.

## Task 3: TanStack Query 기반 연결

**Files:** package.json, pnpm-lock.yaml, src/lib/query-client.ts, src/app/providers.tsx, src/app/layout.tsx, handoff.md.

**Interfaces:** makeQueryClient(): QueryClient를 export한다. Providers({children}: {children: ReactNode})는 서버 컴포넌트 children을 그대로 감싼다. 이 작업은 실제 API나 queryKey를 만들지 않는다.

- [ ] **1. @tanstack/react-query 안정 버전 설치.**

```text
pnpm add --save-exact @tanstack/react-query
```

설치된 버전의 공식 SSR 패턴과 React 호환성을 확인한다. src/lib/query-client.ts에 다음 정책을 둔다.

```ts
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
```

- [ ] **2. provider와 서버/브라우저 생명주기 연결.**

```tsx
'use client';

import { isServer, QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { makeQueryClient } from '@/lib/query-client';

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
```

layout.tsx의 body 안에서 <Providers>{children}</Providers>로 연결한다. layout.tsx에는 'use client'를 추가하지 않는다. 브라우저 변수에 서버에서 생성한 클라이언트를 할당하지 않는다.

- [ ] **3. 검증과 상태 기록.**

lint·typecheck·build를 수행하고 개발 페이지의 새로고침 및 이동 시 hydration/컨텍스트 오류가 없는지 확인한다. 실제 데이터 API가 없으므로 네트워크 캐시나 SSR hydration의 기능 검증을 완료했다고 쓰지 않는다. Query provider와 기본 정책 연결 완료로만 기록한다.

## Task 4: OpenNext 로컬 빌드 준비 및 환경 인계

**Files:** package.json, pnpm-lock.yaml, open-next.config.ts, wrangler.jsonc, next.config.ts, .gitignore, handoff.md.

**Interfaces:** pnpm build:cf는 배포용 산출물을 생성하고 pnpm preview:cf는 로컬 Workers를 실행한다. 원격 로그인과 배포 스크립트는 이번에 실행하지 않는다.

- [ ] **1. 공식 어댑터의 호환 버전 설치 및 설정.**

```text
pnpm add -D --save-exact @opennextjs/cloudflare wrangler
```

설치 버전의 peer dependency와 공식 get-started 문서를 다시 확인하고 다음 파일을 작성한다.

```ts
// open-next.config.ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
```

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "uridongne-mvp",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-09-03",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
}
```

next.config.ts의 기존 설정을 보존하고 어댑터가 요구하는 설정만 반영한다. 이 단계의 페이지는 D1·R2·ISR·이미지 최적화에 의존하지 않는다. 계정 ID나 존재하지 않는 DB ID로 설정을 채우지 않는다.

- [ ] **2. 빌드·로컬 preview 명령 추가.**

```json
{
  "build:cf": "opennextjs-cloudflare build",
  "preview:cf": "pnpm build:cf && opennextjs-cloudflare preview"
}
```

셸을 직접 사용할 때 독립 명령은 개별 실행한다. 위 &&는 package.json에서 build 성공 후 preview를 실행하기 위한 의존 관계다.

- [ ] **3. Next와 Workers 검증을 구분하여 실행.**

```text
pnpm lint
pnpm typecheck
pnpm build:cf
```

OpenNext 빌드가 성공하면 로컬 preview로 루트 응답을 확인한다. Windows 플랫폼 이슈가 재현되면 코드 오류인지 먼저 구분하고, 실제 에러·Node 버전·어댑터 버전을 기록한다. 기존 WSL/Linux 환경을 사용할 수 있으면 검증하되 새 시스템 환경 설치를 묵시적으로 실행하지 않는다. 검증 가능한 Linux 환경이 없으면 로컬 Next 검증 완료/Workers 검증 미완료로 정확하게 인계한다.

- [ ] **4. 다른 환경 재개 정보 완성.**

handoff.md에 실제 버전, 실행 명령, 생성한 파일, 검증 결과, 현재 Git 상태, 다음 작업을 적는다. 이 문서에서 완료한 체크박스만 표시한다. GitHub 미연결 상태에서는 저장소 주소·CI 결과를 적지 않는다. 사용자가 GitHub 연결을 요청하면 README와 Linux CI를 다음 작업으로 진행한다. Cloudflare 연결은 기본 환경 검증 결과를 보여준 후 실제 D1 연동 전에 제안한다.

## 완료 보고

앱 초기화, 스타일 검증, Query provider, Next 빌드, OpenNext 빌드·Workers preview를 각각 완료/미검증으로 구분한다. 실제 실행하지 않은 기능이나 배포를 성공으로 보고하지 않는다. 다음 단계는 공공데이터 표본 기반 데이터 설계이며 사용자에게 설계용 모델 전환 시점을 알린다.
