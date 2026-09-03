# 동네로그

숫자로 보는 우리 동네의 변화.

서울 행정동별 상권과 생활인구가 시간에 따라 어떻게 달라졌는지 보여주는 웹서비스를 만드는 중입니다.

## 현재 상태

초기 개발 환경과 디자인 토큰을 준비했습니다. 실제 서울시 데이터 수집·D1 스키마·동네 검색은 다음 단계에서 구현합니다. 자세한 작업 기록은 [handoff.md](handoff.md)를 참고하세요.

## 기술 구성

- Next.js 16 · React 19 · TypeScript
- Tailwind CSS 4 · TanStack Query · pnpm
- Cloudflare Workers용 OpenNext 준비
- 향후 데이터 저장: Cloudflare D1 + Drizzle, 원본 보관: R2

## 시작하기

Node.js 24.12.0과 pnpm 10.30.3을 사용합니다.

```bash
pnpm install
pnpm dev
```

개발용 스타일 확인 화면은 `http://localhost:3000/dev/styles`입니다.

## 검증

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

OpenNext 빌드는 Windows에서 심볼릭 링크 권한 제약으로 실패할 수 있습니다. 현재는 WSL 또는 Linux CI에서 재검증이 필요합니다.

## 참고 자료

- [MVP 기획안](docs/references/mvp-proposal.md)
- [스타일 변수 원본](docs/references/style-tokens.reference.txt)
- [디자인 참고](docs/references/design/direction.md)
