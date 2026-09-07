# 동네로그

숫자로 보는 우리 동네의 변화.

서울 행정동별 상권과 생활인구가 시간에 따라 어떻게 달라졌는지 보여주는 웹서비스를 만드는 중입니다.

## 현재 상태

초기 개발 환경과 디자인 토큰을 준비했고, 서울시 상권·생활인구 실원본의 결정적 프로파일과 생활인구 월별 정규화·동별 비교 CLI를 구현했습니다. 방법 근거가 확인되지 않은 비교는 의도적으로 `unavailable`로 남깁니다. 자세한 작업 기록은 [handoff.md](handoff.md)를 참고하세요.

정규화 CLI는 로컬 검증용입니다. 기준일·출처·해시·스키마·방법 근거 메타데이터와 행정동 목록 유효기간을 검사합니다. 실제 공식 근거 확보와 산출물 계약의 나머지 검증은 D1 적재·서비스 공개 전 보완이 필요합니다.

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

공식 원본은 `data/raw/`에 로컬로만 보관하고 Git에 커밋하지 않습니다. 프로파일에는 공개 메타데이터, 집계 카운터, 엔트리별 최대 5개 표본 행만 기록합니다.

```bash
pnpm data:inspect -- --kind population --period YYYYMM --input <local-official-file> --output <profile.json> --schema <schema-json>
pnpm data:compare -- --current <profile> --previous-year <profile> --previous-month <profile> --output <comparison.json>
pnpm data:normalize-population -- --input <local-official-file> --contract <contract.json> --output-dir <local-work-dir>
pnpm data:compare-population -- --current-dir <current-dir> --previous-year-dir <previous-year-dir> --previous-month-dir <previous-month-dir> --changes <changes.json> --output-dir <comparison-dir>
```

`--schema`에는 `date`, `hour`, `dongCode`, `totalPopulation`에 대응하는 실제 헤더명을 JSON 객체로 전달합니다. 측정 결과는 [원본 표본 검증 보고서](docs/data/2026-09-04-source-sample-validation.md)에서 확인할 수 있습니다.
정규화 계약·실행 결과는 [생활인구 정규화 실행 기록](docs/data/2026-09-07-population-normalization.md)과 `data/source-contracts/`에서 확인할 수 있습니다.

출력에는 기존에 없는 디렉터리를 지정합니다. 무효 월은 `errors.json`·`run.json`만 남기고 완료 표식을 생성하지 않습니다. 정상 월을 읽을 때는 manifest와 monthly/run 해시를 모두 검사합니다. 비교 결과가 전부 `unavailable`이면 결과 파일은 기록하되 비교 CLI는 종료 코드 2를 반환합니다(pnpm은 이를 명령 실패로 표시할 수 있습니다).

정규화 계약은 `data/source-contracts/population-202607.json`을 예로 사용합니다. 필수 항목은 `period`, 서울 기준 달력 날짜 `asOfDate`, `sourceId: OA-23016`, `schemaVersion: oa23016-hourly-v1`, `method`, `registry`, 원본 SHA-256인 `expectedSha256`입니다. 해당 월이 끝난 다음 달 1일부터 처리할 수 있습니다. 누락·알 수 없는 필드·잘못된 설정은 원본을 읽기 전에 종료 코드 1로 거부하고, 원본 해시/관측 검증 실패는 2로 처리합니다.

방법 미확인은 `{ "status": "unverified", "version": null, "evidenceIds": [] }`로 기록합니다. `verified`에는 버전과 비어 있지 않은 근거 ID 목록이 필요하지만, 형식 검사는 그 자료 내용의 사실 확인을 대신하지 않습니다. 근거 계약이 없는 이전 결과의 `methodStatus: verified`만으로 비교를 허용하지 않습니다.

공식 목록이 없으면 `registry: null`과 `coverageStatus: observed_only`입니다. 목록이 있으면 `version`, `evidenceIds`, `dongs`를 전달하며 각 동은 8자리 문자열 `code`, 포함 시작일 `validFrom`, 제외 종료일 `validToExclusive`(기한 없음은 null)를 가집니다. 중복 코드·잘못된 날짜를 거부하고 관측의 코드와 유효기간을 검사합니다. 월중 신설·폐지는 월 전체 슬롯 기준 미완결로 남습니다.

OpenNext 빌드는 Windows에서 심볼릭 링크 권한 제약으로 실패할 수 있습니다. 현재는 WSL 또는 Linux CI에서 재검증이 필요합니다.

## 참고 자료

- [MVP 기획안](docs/references/mvp-proposal.md)
- [스타일 변수 원본](docs/references/style-tokens.reference.txt)
- [디자인 참고](docs/references/design/direction.md)
