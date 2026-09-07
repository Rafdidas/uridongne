# 초기 개발 환경 설계

작성일: 2026-09-03

상태: 사용자와 합의한 기술 구성을 프로젝트 생성 단위로 구체화한 설계. 코드 구현 전 모델 전환 지점에서 검토할 문서다. 애플리케이션 구현은 아직 시작하지 않았다.

## 1. 이번 작업의 결과

다른 환경에서도 pnpm으로 재현할 수 있는 Next.js 앱을 만든다. 루트 페이지는 프로젝트 준비 상태를 보여주고, 개발용 스타일 확인 페이지에서 사용자 제공 토큰이 실제로 적용되는지 확인한다. TanStack Query와 Cloudflare 빌드의 기초를 마련한다.

이번 단위에는 공공데이터 수집, 실제 동네 검색, 동네 상세 기능, DB 스키마, 외부 계정 연결, 공개 배포를 포함하지 않는다. DB는 D1 + Drizzle, 원본은 R2라는 방향을 유지하되 실제 데이터 표본을 확인한 다음 단위에서 구현한다.

## 2. 공통 제약

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

## 3. 실행 환경과 의존성

2026-09-03 로컬 확인 결과는 Node.js 24.12.0, pnpm 10.30.3이다. 이는 설치 현황이며 최신 버전이라는 뜻은 아니다.

구현 시작 시 공식 레지스트리에서 Next.js 16 최신 안정 패치와 React peer dependency를 확인하고 호환되는 정확한 버전으로 저장한다. Tailwind 4와 PostCSS 플러그인의 버전도 맞춘다. pnpm은 현재 10.30.3을 기준으로 packageManager에 고정한다. 어댑터가 더 높은 버전을 요구하면 업데이트 이유와 최종 버전을 handoff.md에 남긴다. Node.js는 24 LTS 내 보안·도구 요구사항을 확인한 패치로 .node-version에 고정한다. 시스템 전역 Node를 묵시적으로 교체하지 않는다.

앱 런타임 의존성은 next, react, react-dom, @tanstack/react-query로 시작한다. 개발 도구는 TypeScript, 타입 패키지, ESLint와 Next 설정, tailwindcss, @tailwindcss/postcss, postcss, @opennextjs/cloudflare, wrangler이다. Emotion, UI 라이브러리, 차트, Drizzle, Zod는 해당 기능을 시작할 때 설치한다.

pnpm-lock.yaml과 packageManager를 함께 관리한다. 다른 패키지 관리자의 잠금 파일을 섞지 않는다. 등록되지 않은 패키지 빌드 스크립트는 목록을 읽고 필요한 도구만 허용한다.

## 4. 파일 책임

| 파일 | 책임 |
| --- | --- |
| package.json / pnpm-lock.yaml | 버전 및 실행 스크립트 |
| .node-version / .npmrc | 실행 환경 재현, 직접 의존성 정확한 버전 저장 |
| tsconfig.json / eslint.config.mjs | strict 타입 검사, Next ESLint 설정 |
| next.config.ts / postcss.config.mjs | Next와 Tailwind 빌드 연결 |
| src/app/layout.tsx | lang=ko, 전역 CSS, 공통 메타데이터, Query provider 경계 |
| src/app/page.tsx | 데이터 연결 전 준비 화면 |
| src/app/dev/styles/page.tsx | 개발 환경 전용 토큰 확인 페이지 |
| src/app/globals.css | CSS import와 최소 전역 레이아웃·접근성 규칙 |
| src/styles/styleConstants.ts | 첨부 토큰의 JS 원본 및 공유 상수 |
| src/styles/theme.css | 실제 팔레트 값, 의미별 CSS 변수, 기본 글꼴 |
| src/styles/surfaces.css | 반투명 카드·패널과 불투명 대체 스타일 |
| tailwind.config.ts | 공유 토큰을 Tailwind 4의 @config 호환 경로에 연결 |
| src/lib/query-client.ts | QueryClient 생성 함수 |
| src/app/providers.tsx | 클라이언트 QueryClient 생명주기 관리 |
| open-next.config.ts / wrangler.jsonc | 계정 연결 없이 작성 가능한 Workers 빌드 설정 |
| .gitignore | 빌드 결과·로컬 상태·비밀값 제외 |
| AGENTS.md | handoff.md 우선 읽기 및 단계별 기록 규칙 |

템플릿이 파일 확장자를 다르게 생성하면 동일한 책임으로 정리하고 문서 경로를 수정한다. 기능 없는 추상화나 빈 API·DB 모듈을 미리 만들지 않는다.

## 5. 스타일 시스템

원본: [사용자 스타일 변수](../../references/style-tokens.reference.txt).

추가 사용자 방향: [반투명·라운드 디자인 참고](../../references/design/direction.md). 첨부 이미지 6장을 이 문서와 함께 읽는다. 아래 재질·크기 기준은 기존의 일반 흰색 카드 예시보다 우선한다.

### 공유 방식

첨부 설정 객체를 styleConstants.ts에서 타입이 있는 객체로 옮긴다. ScreenBreakpoints는 이 파일에서 한 번만 정의하고 Tailwind screens에 직접 연결한다. 간격 객체도 spacing과 gap이 함께 참조한다. JS에서 반응형 분기가 필요한 기능이 생기면 이 상수를 사용하며, 현재 단계에서는 화면 폭에 따라 서버 HTML이 달라지는 로직을 추가하지 않는다.

Tailwind 4에서는 JS 설정을 자동 탐지한다고 가정하지 않고 globals.css의 @config로 명시적으로 연결한다. CSS 색상 값은 theme.css가 소유한다. Tailwind 설정의 색상 값은 원본과 같이 var(--primary) 등의 참조로 유지한다. Emotion이 추가되어도 이 CSS 변수를 사용한다.

사용자 정의 이름은 그대로 유지한다. 예: bg-primaryLow, text-onSurface, text-body-xl, gap-md, rounded-xl, shadow-gs1. Tailwind 기본 숫자형 간격은 함께 사용할 수 있게 유지한다. screens는 사용자 값으로 대체하며 Tailwind 기본값이 남아 혼합되지 않는지 실제 CSS로 검증한다.

### 빠진 값의 초기 기본안

이 절의 값은 최종 브랜드 결정이 아닌 교체 가능한 초기 기본값이다.

- 밝은 테마부터 시작한다. 기본 surface는 #ffffff, on-surface는 #1c1720, outline은 #d9c9d8, primary는 #a46f90, on-primary는 #1c1720이다. 흰색·검정 계열은 읽기와 대비를 위한 역할에 유지하고, 그 밖의 임시 색상은 저채도 파스텔로 둔다.
- 임시 글꼴은 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif. 원격 폰트 다운로드를 초기 빌드의 전제로 두지 않는다.
- 본문 기본 크기는 body-xl 16px. 첨부 10~11px caption은 토큰으로 보존하되 핵심 설명·출처·조작에는 쓰지 않는다.
- line-height는 display/headline/title 1.25, label 1.4, body/caption 1.6으로 시작한다. 사용자 제공 fontWeight는 그대로 유지한다.
- 색상 단계는 Tailwind 기본 팔레트를 참조한 실제 CSS 색상 값으로 정의한다. Tailwind가 사용하지 않는 변수를 제거하더라도 동작하도록 직접 사용하는 CSS 변수에 의존한다.
- primary는 로즈 모브, surface/outline/onSurface는 연보라-회색 기반으로 둔다. 사용자 파일의 빨강~보라 계열도 화면에 추가할 때는 같은 명도의 저채도 파스텔을 사용한다. Low 계열이 밝고 High 계열이 어두운 규칙으로 통일한다.
- 단계 대응: UltraLow=50, Lowest=100, Lower=200, Low=300, Mid=400, High=600, Higher=700, Highest=800, UltraHigh=950. 기본 색상은 Higher 단계이며 primary는 #a46f90을 사용한다.
- onPrimary 및 onRed 등 색상 표면 위의 글자색은 해당 배경에 대해 #1c1720와 #ffffff 중 대비가 높은 값을 선택한다. base와 각 단계별로 확인한다. onSurface는 별도의 본문 강도 계열로 연보라-회색 단계를 쓰고 base는 위 값을 유지한다.
- overlay의 기본 불투명도는 0.24, Lowest=.04, Lower=.08, Low=.12, Mid=.24, High=.40, Higher=.56, Highest=.72. 원본에 존재하는 단계만 만든다. White=#ffffff, Gray=#786d78, Black=#000000.
- transparent는 transparent, variant-backdrop은 overlay-black-high, variant-snackbar는 #1c1720.
- 의미별 추가 토큰은 change-increase=#6c8f82(세이지), change-decrease=#b77d8f(더스티 로즈), change-neutral=#786d78로 시작한다. 숫자 앞의 +/−와 설명을 함께 사용하여 색상만으로 정보를 전달하지 않는다. 이는 좋음/나쁨 평가가 아니다.
- 스타일 확인 화면은 최대 1200px, 모바일 좌우 16px, md부터 24px 여백을 사용한다. 제품 최종 상세 페이지 배치는 다음 화면 설계에서 정한다.

### 반투명·라운드 재질과 크기

사용자는 반투명 표면과 둥근 디자인을 기본으로 요청했다. 배경은 #f6f1f7을 시작값으로 하고 연한 라일락·피치·민트의 정적인 색 번짐을 낮은 강도로 배치한다. 이는 glass 재질을 보이게 하는 바탕이며 큰 사진이나 장식용 히어로를 추가하는 요구가 아니다. primary의 최종 브랜드 색은 여전히 확정하지 않았다.

기존 surface=#ffffff는 읽기용 불투명 표면으로 유지하고 아래 역할별 토큰을 추가한다. 아래 수치는 시각 검토를 위한 초기값이며 실제 합성 배경에서 가독성을 확인한 뒤 조정한다.

| 토큰 | 초기값 | 역할 |
| --- | --- | --- |
| --canvas | #f6f1f7 | 전체 바탕 |
| --surface-glass | rgb(255 255 255 / 72%) | 주요 패널·카드의 반투명 배경 |
| --surface-glass-strong | rgb(255 255 255 / 90%) | 차트·세밀한 데이터 영역 |
| --surface-glass-fallback | #fbf7fb | 배경 흐림 미지원·투명도 감소 시 대체 |
| --outline-glass | rgb(255 255 255 / 65%) | 유리 표면의 1px 윤곽 |
| --blur-glass | 16px | 주요 외곽 패널의 배경 흐림 |

StyleColors에는 canvas, surfaceGlass, surfaceGlassStrong, surfaceGlassFallback, outlineGlass를 해당 변수 참조로 추가한다. StyleBorderRadius에는 card=20px, panel=24px, pill=9999px를 추가한다. 기존 xxs~xl을 재정의하지 않는다. 그림자는 기존 gs1을 일반 카드에, gs2를 떠 있는 패널에 사용한다.

surfaces.css의 .glass-panel은 기본 불투명 대체 표면, 1px 테두리와 gs1에 해당하는 그림자를 사용한다. 지원 여부를 확인하는 @supports 안에서만 surface-glass와 backdrop-filter: blur(var(--blur-glass))를 켠다. .glass-inset은 surface-glass-strong을 사용하며 별도 블러는 적용하지 않는다. border-radius는 rounded-card / rounded-panel / rounded-pill 클래스로 지정한다. prefers-reduced-transparency: reduce에서 블러를 끄고 대체 표면을 사용한다. forced-colors에서는 시스템 Canvas·CanvasText·테두리를 사용한다.

요소 전체 opacity와 filter: blur()로 내용까지 흐리게 만들지 않는다. 텍스트·아이콘·차트 선은 선명하게 유지하며 여러 반투명 레이어를 중첩하지 않는다. 투명 표면의 글자 대비는 흰색 배경 가정이 아닌 실제 배경과 합성된 결과로 검증한다.

카드 padding은 16px, 큰 패널은 24px, 카드 사이 간격은 기본 16px로 시작한다. 카드 제목은 title-md/lg 18~20px, 핵심 숫자는 display-sm/lg 24~30px, 페이지 제목은 display-md/lg 26~30px를 우선한다. display-xl 44px은 원본 토큰으로 남기되 모든 페이지 제목이나 지표에 기본 적용하지 않는다. 본문 14~16px, 보조 레이블 12~13px를 사용한다. 버튼·검색창은 기본 높이 44px로 하여 UI 밀도를 높이면서 조작 영역을 확보한다. 모바일에서는 카드 폭을 줄이고 한 열로 재배치하며 텍스트를 일괄 축소하지 않는다.

### 검증 화면

/dev/styles는 개발 실행에서만 노출하고 production에서는 notFound()로 404를 반환한다. 검색 엔진에 노출하지 않는다. 모든 원본 색상의 견본과 이름, 타이포그래피, 간격·모서리·그림자, 버튼·검색 입력의 기본 상태, 예시임을 명시한 증감 표시를 보여준다. 데이터 API를 만들지 않고 정적 예시로 검증한다.

첫 화면에는 실제 크기의 glass 패널, 검색 입력, 예시 변화 카드와 작은 정적 그래프를 함께 배치한다. 배경의 파랑·코랄 영역을 가로지르는 같은 카드로 합성 대비를 확인하고, 블러 사용 상태와 불투명 대체 상태를 나란히 확인할 수 있게 한다. 참고 이미지처럼 거대한 수치나 넓은 빈 공간을 기본 레이아웃에 사용하지 않는다.

토큰을 동적으로 순회할 때 클래스 문자열을 조합해 Tailwind의 탐지를 깨뜨리지 않는다. 견본 색상은 CSS 변수 inline style로 보여주고, 실제 Tailwind 연결 확인용 클래스는 소스에 완성된 문자열로 적는다. 파생 스타일의 값이 정적이어야 하는 미디어 쿼리에는 런타임 CSS var()를 넣지 않는다.

## 6. 서버·클라이언트 경계

layout과 page는 기본 서버 컴포넌트로 둔다. Query provider만 클라이언트 경계로 둔다. children으로 전달된 서버 컴포넌트를 전부 클라이언트로 옮기지 않는다.

makeQueryClient(): QueryClient를 공통 생성 함수로 제공한다. 서버에서는 요청 간 캐시를 공유하지 않고, 브라우저에서는 provider가 렌더링되어도 같은 클라이언트를 재사용한다. 초기 기본 정책은 staleTime=5분, gcTime=30분, refetchOnWindowFocus=false, retry=1이다. 추후 실제 API에서 4xx 재시도 제외와 데이터 갱신 주기에 맞춘 query별 정책을 적용한다. 이 값들은 서버/CDN 캐시 정책과 별개다.

이 단계에서는 가짜 조회 API나 의미 없는 useQuery 호출을 만들지 않는다. 실제 기간·업종별 조회 시 queryKey에 행정동·기간·업종을 포함하고 서버에서 미리 조회한 결과를 hydration으로 전달하는 상세 설계를 추가한다.

## 7. Cloudflare 준비와 연결 시점

OpenNext의 일반 설정과 로컬 빌드 스크립트까지만 준비한다. Workers 런타임은 workerd이며, nodejs_compat를 사용한다. Node.js 개발 환경에서 성공한 빌드와 Workers 검증을 구분한다.

wrangler.jsonc에는 기술용 이름 uridongne-mvp, Worker 엔트리 .open-next/worker.js, 정적 파일 .open-next/assets와 ASSETS 바인딩, compatibility_date=2026-09-03, nodejs_compat를 설정한다. D1 ID, R2 버킷, 계정 ID, 도메인은 넣지 않는다. ISR·이미지 최적화·캐시 백엔드도 첫 준비 화면에서 사용하지 않는다.

OpenNext 빌드는 Windows 지원에 제약이 있으므로 실패 원인이 플랫폼에 있으면 로그를 기록하고 Linux 검증 항목을 남긴다. 검증하지 않은 Cloudflare 호환성을 완료로 표시하지 않는다. 외부 연결 요청 전에는 로그인·deploy·원격 리소스 생성 명령을 실행하지 않는다.

기본 앱·스타일 확인 및 빌드가 끝나면 GitHub 연결 요청을 기다린다. GitHub 연결 후 Linux CI에서 어댑터 빌드를 검증하고 Cloudflare 최초 연결을 제안한다. 사용자가 Cloudflare를 먼저 요청하면 GitHub를 필수 선행 조건으로 강제하지 않는다.

## 8. 오류·검증·완료 기준

- 입력값 없이 외부 API를 호출하는 오류 경로를 만들지 않는다. 준비 화면은 데이터 연결 전 상태를 정확하게 표시한다.
- lint, typecheck, Next production build가 성공해야 한다.
- 개발 페이지에서 원본 토큰과 실제 CSS를 대조한다. 479/480, 767/768, 1199/1200, 1439/1440, 1919/1920px에서 반응형 클래스를 확인한다.
- 360px 화면에서 가로 넘침이 없어야 한다. 키보드 포커스가 보이고 본문 대비는 WCAG AA 기준 4.5:1을 목표로 확인한다.
- 반투명 카드의 글자·아이콘이 함께 흐려지지 않아야 한다. 실제 색 번짐 위의 대비, 블러 비활성 대체 상태, 작은 화면에서의 스크롤과 중첩 블러 유무를 확인한다.
- production에서 /dev/styles는 404이며 루트 준비 페이지는 표시되어야 한다.
- OpenNext 빌드·로컬 Workers 검증은 실제 실행 환경과 성공/실패를 별도로 기록한다. 플랫폼 문제로 미검증이면 GitHub/Linux 검증 전 단계로 인계한다.
- 재현 명령, 확정 버전, 변경 파일, 남은 문제를 handoff.md에 기록한다. 비어 있는 틀만 검사하는 테스트는 추가하지 않는다.

## 9. 다음 설계 단위

초기 환경 다음에는 점포와 생활인구 표본을 확인한다. 행정동 코드 대응, 기간 누락, 업종 분류, 개업·폐업률 분모, 생활인구 평균 정의와 원본 저장량을 확인한 뒤 D1 스키마와 수집 작업을 설계한다. 현재 DB 방향 합의가 스키마 검증 완료를 뜻하지 않는다.

## 공식 근거

- [Tailwind 4 directives 및 @config](https://tailwindcss.com/docs/functions-and-directives)
- [Tailwind 테마](https://tailwindcss.com/docs/theme)
- [TanStack Query 서버 렌더링](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- [OpenNext 설정](https://opennext.js.org/cloudflare/get-started)
- [create-next-app 옵션](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
