# Population Monthly Normalization Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans, task by task. Use subagents only if the user requests delegation. Steps use checkbox syntax for tracking.

**Goal:** 월 단일 CSV와 일별 다중 CSV에서 결정적인 생활인구 월 집계와 동별 비교 판정을 생성한다.

**Architecture:** 기존 진단 프로파일러와 분리된 `src/data/population/` 모듈을 만든다. 엔트리 순차 해독 → 행 스트림 → 엄격 관측 변환 → 슬롯 검사·정수 합계 → 검증된 월 결과 → 동별 비교 순서다. 결과는 로컬의 실행별 디렉터리에 저장하고 완료 표시가 있는 산출물만 소비한다.

**Tech Stack:** Node.js 24.12.0, pnpm 10.30.3, TypeScript 6.0.2, Vitest 4.1.11, tsx 4.23.13, adm-zip 0.6.0, csv-parse 7.0.2, iconv-lite 0.7.3. 기존 설치 버전을 사용한다.

**Spec:** `docs/superpowers/specs/2026-09-07-population-normalization-design.md`

## Global Constraints

- MVP는 동일 행정동 코드끼리만 비교한다. 코드가 다르면 자동으로 이름 연결·비례 배분하지 않는다.
- 원본 ZIP을 보존하고 정규화 시간별 전체 파일은 영구 저장하지 않는다. 읽는 동안 검증·집계하고 월 집계와 검증 매니페스트를 저장한다.
- ZIP 256 MiB, 엔트리 128 MiB, 총 해제 크기 1 GiB, 엔트리 64개.
- 소수 자릿수는 최대 6자리, 초과 시 반올림하지 않고 실패한다. 합계는 10^6 배 BigInt, 최종 평균은 소수 여섯 자리 half-up이다.
- 구조·타입·중복 오류가 있으면 해당 원본 실행 전체를 실패시켜 공개 후보를 생성하지 않는다.
- 원본은 `data/raw/`, 작업 결과는 `data/work/`. Git에는 전체 시간별 관측을 추가하지 않는다.
- 기준월과 `asOfDate`는 명시적으로 입력한다. 공식 근거 미확인을 통과로 바꾸지 않는다.
- Cloudflare 연결·배포·GitHub 푸시는 이번 범위 밖이다. 기존 파스텔 변경과 미커밋 handoff 기록을 보존한다.
- 구현 전 사용자 모델 전환을 확인한다. 시작 시 실제 Git 상태를 다시 확인하고 작업 브랜치를 사용한다. 커밋은 해당 Task 파일만 지정한다.

## 공통 계약과 파일 구조

다음 타입을 Task 1에서 정의한다. JSON 필드의 의미와 null 조건은 후속 Task에서도 동일하다.

```ts
type CoverageStatus = "observed_only" | "expected_registry";
type Reason = "invalid_source" | "current_incomplete" | "candidate_incomplete"
  | "method_unverified" | "method_mismatch" | "schema_mismatch"
  | "administrative_area_unverified" | "administrative_area_changed";
interface Observation {
  date: string; hour: number; dongCode: string; populationMicros: bigint;
}
interface LocatedRow {
  entry: string; line: number; values: Record<string, string>;
}
interface MethodEvidence {
  status: "verified" | "unverified";
  version: string | null;
  evidenceIds: string[];
}
interface ExpectedDong {
  code: string; validFrom: string; validToExclusive: string | null;
}
interface MonthInput {
  period: string; asOfDate: string; sourceId: "OA-23016";
  schemaVersion: string; method: MethodEvidence;
  registry: { version: string; evidenceIds: string[]; dongs: ExpectedDong[] } | null;
}
interface DongMonth {
  dongCode: string; expectedCount: number; observedCount: number;
  missingCount: number; missingRate: number;
  firstDate: string | null; lastDate: string | null;
  sumMicros: string; mean: string | null;
  status: "complete" | "incomplete";
}
interface MonthResult {
  input: MonthInput; status: "valid" | "invalid";
  coverageStatus: CoverageStatus; dongs: DongMonth[];
  errors: { counts: Record<string, number>; samples: { code: string; entry: string; line: number }[] };
}
interface AreaChange {
  code: string; effectiveDate: string; evidenceId: string;
  kind: "boundary_change" | "retired" | "created";
}
interface DongComparison {
  dongCode: string;
  comparisonMode: "same_month_previous_year" | "previous_month" | "unavailable";
  comparisonPeriod: string | null; fallbackReason: Reason | null;
  candidateFailures: { period: string; reasons: Reason[] }[];
  codeMatchBasis: "same_code_only" | null;
  currentMean: string | null; previousMean: string | null;
  difference: string | null; percentChange: string | null;
  percentUnavailableReason: "previous_value_zero" | null;
}
```

`status: invalid` 결과는 `dongs: []`이며 오류 기록만 소비한다. 기대 코드 목록이 없으면 `observed_only`; 목록이 있으면 유효기간을 검증하고 목록 외 코드는 오류다. 월중 유효기간이 바뀌는 동은 월 전체 슬롯 기준 미완결로 둔다.

| 파일 | 책임 |
| --- | --- |
| `src/data/population/types.ts` | 위 타입과 실행 매니페스트 타입 |
| `schema.ts`, `observation.ts`, `decimal.ts` | 승인 헤더, 엄격 변환, 정수 기반 계산 |
| `read-rows.ts` | 한 엔트리씩 읽는 CSV 비동기 iterator |
| `aggregate-month.ts` | 동별 슬롯·결측·월평균 |
| `compare-months.ts` | 기간·방법·행정동 정책 및 동별 비교 |
| `artifact-output.ts` | 해시·결정적 직렬화·완료 표시 저장 |
| `scripts/data/normalize-population.ts` | 정규화 CLI |
| `scripts/data/compare-population.ts` | 의미 비교 CLI |
| `src/data/population/test-fixtures.ts` | 테스트 전용 CSV/ZIP fixture 생성 |
| 각 모듈의 `.test.ts` | 해당 행동 검증 |
| `data/source-contracts/population-*.json` | 기간별 출처·방법 근거 입력, 원문 없음 |
| `docs/data/2026-09-07-population-normalization.md` | 실측 검증 결과 |

## Task 1: 엄격한 관측 계약과 정확한 십진수 계산

**Files:** Create `types.ts`, `schema.ts`, `observation.ts`, `decimal.ts` 및 `observation.test.ts`, `decimal.test.ts` (모두 `src/data/population/` 아래).

**Interfaces:** `parseObservation(row: LocatedRow, period: string): Observation`; `parseMicros(text: string): bigint`; `formatMean(sum: bigint, count: number): string`; `daysInMonth(period: string): number`. 변환 실패는 안정된 `code`와 위치를 가진 오류로 반환/throw하여 Task 3이 집계한다.

- [ ] `data/profiles/population-202607.json`의 첫 엔트리에서 32개 헤더를 읽고 세 월의 모든 헤더가 같은지 읽기 전용 비교한다. 해당 정확한 목록을 `schema.ts`에 고정한다. 이름을 추정하지 않는다.
- [ ] 아래 행동 테스트를 작성하고 `pnpm test -- src/data/population/observation.test.ts src/data/population/decimal.test.ts`로 실패를 확인한다.

```ts
expect(parseMicros("100.125")).toBe(100125000n);
expect(formatMean(3n, 2)).toBe("0.000002");
expect(formatMean(300000000n, 2)).toBe("150.000000");
expect(daysInMonth("202402")).toBe(29);
expect(daysInMonth("202502")).toBe(28);
for (const text of ["", " ", "*", "NaN", "Infinity", "1e3", "-1", "1.1234567"]) {
  expect(() => parseMicros(text)).toThrow();
}
```

- [ ] fixture의 `일자=20260701`, `시간=00`, `행정동코드=00123456     `, `생활인구합계=100.125`가 코드 선행 0과 숫자 시간 0을 보존함을 테스트한다. `20260230`, 다른 월, 시간 `24`·`1.5`·빈 값, 코드 내부 공백·7자리·문자를 각각 거부한다.
- [ ] 변환 구현: 날짜 구성요소를 UTC 달력 round-trip으로 검증한다. 시간은 `/^\d{1,2}$/`, 코드는 `/^\d{8}$/`, 수치는 `/^\d+(?:\.\d{1,6})?$/`로 양끝 공백 제거 후 검증한다. 정수부와 소수부 padEnd(6)를 BigInt로 결합한다.

```ts
const quotient = sum / BigInt(count);
const remainder = sum % BigInt(count);
const roundedMicros = quotient + (remainder * 2n >= BigInt(count) ? 1n : 0n);
// count <= 0은 오류. 정수부와 나머지를 분리하여 소수부 여섯 자리를 출력한다.
```

- [ ] 집중 테스트와 `pnpm typecheck` 통과 후 해당 파일만 커밋한다: `feat: validate population observations`.

## Task 2: ZIP 엔트리 순차 처리와 CSV 행 스트림

**Files:** Create `read-rows.ts`, `read-rows.test.ts`, `test-fixtures.ts`.

**Interfaces:** `readPopulationRows(inputPath: string, onEntry: (metadata: EntryMetadata) => void): AsyncIterable<LocatedRow>`. `EntryMetadata`는 엔트리명, 바이트, 인코딩, 헤더/데이터 구분자, 읽은 행 수를 담는다. Task 1의 승인 헤더 목록을 소비한다.

- [ ] 작은 합성 ZIP에서 같은 관측을 월 파일 1개와 일별 파일 2개로 제공하여 같은 정규화 관측 집합이 나오는 테스트를 작성한다. 세미콜론 행+쉼표 헤더, EUC-KR, UTF-8 합성 fixture, 혼합 개행, 따옴표 포함 필드를 포함한다.
- [ ] 빈 ZIP, CSV 없는 ZIP, 비CSV 엔트리, 중복/누락/추가 헤더, 필드 수 불일치와 제한 초과를 테스트한다. 한도는 주입 가능한 축소값으로 검증해 대용량 fixture 생성을 피한다. 디렉터리 엔트리는 제외하고 64개 한도는 파일에 적용한다.
- [ ] `pnpm test -- src/data/population/read-rows.test.ts` RED 확인 후 구현한다. 기존 `readArtifact`의 모든 엔트리 `getData()` map을 호출하지 않는다. 파일 크기 검사 → ZIP 디렉터리 크기/개수 검사 → 엔트리 하나씩 `getData()` → 해제 후 실제 크기 재검사 순서다.
- [ ] csv-parse 스트림 API를 사용하고 생산/소비의 backpressure를 유지한다. 헤더는 배열로 먼저 파싱해 중복을 확인하고 실제 배열과 승인 목록을 집합 비교한다. 데이터는 승인 헤더명에 대응한다. 엔트리 전체의 줄 배열이나 레코드 배열을 생성하지 않는다. 오류 발생 시 파서 스트림을 종료한다.
- [ ] 집중 테스트와 Task 1 테스트를 실행하고 커밋한다: `feat: stream population archive rows`.

## Task 3: 동별 완결성 검사와 월 집계

**Files:** Create `aggregate-month.ts`, `aggregate-month.test.ts`.

**Interfaces:** `aggregateMonth(rows: AsyncIterable<LocatedRow>, input: MonthInput): Promise<MonthResult>`. Task 1 변환 함수를 사용하고 Task 2 iterator를 소비한다.

- [ ] 2026년 2월의 동 1개에 672개 관측을 공급하는 fixture를 만든다. 336개는 100, 336개는 200으로 채워 mean `150.000000`, sumMicros `100800000000`, missingCount 0을 기대한다. 입력 순서를 뒤집어 같은 결과를 확인한다.
- [ ] 1개 슬롯 누락은 observedCount 671, missingCount 1, mean null을 기대한다. `0`과 `00` 중복, 같은 값 중복, 중복으로 전체 행 수를 채운 결측 fixture는 invalid와 dongs 빈 배열을 기대한다.
- [ ] 공식 기대 목록에만 있는 동의 observedCount 0/mean null, 목록 외 코드 오류, 월중 생성·폐지, observed_only 구분, 윤년 696개 슬롯을 테스트한다. `period=202609`, `asOfDate=2026-09-07`은 진행 중 월 오류다. asOfDate는 서울 기준 달력 날짜로 받고 다음 달 1일부터 완결 월 처리를 허용한다.
- [ ] `pnpm test -- src/data/population/aggregate-month.test.ts` RED 확인 후 코드별 Uint8Array(일수×24)와 BigInt 합계를 구현한다. 중복 키는 정규화된 시간으로 계산한다. 오류 샘플은 20개로 제한하고 종류별 전체 건수는 유지한다. 날짜·코드·수치 오류는 실행을 invalid로 만들고 부분 공개 결과를 제거한다.
- [ ] 동 코드 정렬, null 날짜, 전체 누락, missingRate = missingCount/expectedCount를 확인한다. 등록 코드 목록 중복·잘못된 유효기간·근거 없는 verified 입력은 설정 오류로 처리한다.
- [ ] 전체 population 집중 테스트, typecheck 후 커밋한다: `feat: aggregate complete population months`.

## Task 4: 동별 전년·전월 비교 정책

**Files:** Create `compare-months.ts`, `compare-months.test.ts`; 필요 시 `decimal.ts`에 비교용 유리수 함수를 추가한다.

**Interfaces:** `compareMonths(current: MonthResult, previousYear: MonthResult, previousMonth: MonthResult, changes: AreaChange[]): DongComparison[]`. 후보는 정확히 전년 동월과 직전 월이어야 하며 연도 경계도 처리한다. 잘못된 후보 기간은 설정 오류로 실행을 거부한다.

- [ ] 아래 표를 독립 fixture로 테스트한다. 각 fixture의 current mean은 150, previousYear mean은 100, previousMonth mean은 120이다.

| 조건 | 기대 결과 |
| --- | --- |
| 모두 완결·동일 방법·동일 코드 | 전년, 차이 50, 증감률 50% |
| 전년 관측 누락, 직전 월 정상 | 전월, 차이 30, 증감률 25%, candidate_incomplete 기록 |
| 전년 방법 불일치, 직전 월 정상 | 전월, method_mismatch 기록 |
| 전년 방법 미확인, 직전 월 정상 | 전월, method_unverified 기록 |
| 전년 동 코드 부재, 직전 월 존재 | unavailable, administrative_area_unverified; 전월 자동 대체 금지 |
| 같은 코드지만 비교 구간에 공식 경계 변경 | unavailable, administrative_area_changed |
| 현재 관측 누락 | unavailable, current_incomplete |
| 전년·전월 모두 방법 미확인 | unavailable, 후보별 method_unverified |
| 이전 평균 0 | 차이 표시, 비율 null, previous_value_zero |

- [ ] 한 동만 격리되는 경우 다른 동의 전년 비교가 유지되는지 검증한다. 입력 순서에 무관하게 동 코드 정렬을 유지한다.
- [ ] RED 확인 후 현재 검증 → 코드/변경 여부 → 후보 스키마·방법·완결성 → 허용된 전월 대체 순으로 구현한다. 실패한 원본 전체의 dongs 빈 배열은 코드 폐지 증거가 아니므로 invalid_source로 기록하고, 검증 가능한 직전 월로의 대체를 허용한다. 정상 후보의 단일 코드 부재와 구분한다.
- [ ] 평균 문자열의 반올림 오차가 증감에 누적되지 않도록 `sumMicros/observedCount` 유리수로 차이와 비율을 계산하고 출력에서만 여섯 자리 half-up 처리한다. 음수는 절댓값 반올림 후 부호를 붙이고 음의 0은 제거한다. 표시 비율 단위는 퍼센트다.
- [ ] `pnpm test -- src/data/population/compare-months.test.ts src/data/population/decimal.test.ts` 및 typecheck 후 커밋한다: `feat: decide population comparisons per dong`.

## Task 5: CLI·매니페스트·실원본 증거

**Files:** Create `artifact-output.ts`, `artifact-output.test.ts`, `scripts/data/normalize-population.ts`, `scripts/data/normalize-population.test.ts`, `scripts/data/compare-population.ts`, `scripts/data/compare-population.test.ts`, `data/source-contracts/population-202607.json`, `population-202507.json`, `population-202606.json`, `docs/data/2026-09-07-population-normalization.md`. Modify `package.json`, `README.md`, `handoff.md`.

**Interfaces:** CLI contract files contain MonthInput and expected raw hash. Normalization flags are `--input`, `--contract`, `--output-dir`. Comparison flags are `--current-dir`, `--previous-year-dir`, `--previous-month-dir`, `--changes`, `--output-dir`; `--changes` is a JSON file containing an array, which may be empty. Both commands require explicit output directories under local work storage.

- [ ] CLI 통합 테스트는 합성 fixture를 사용한다. 완성된 출력 재읽기, hash 일치, 중간 실패 시 기존 출력 보존을 확인한다.
- [ ] 출력 계약을 테스트한다: `monthly.json` 또는 `comparison.json`, `manifest.json`, `run.json`, `complete.json`. 완료 표시는 내용 파일 해시를 보존하며 마지막에 작성한다. 소비자는 완료 표시와 모든 해시를 검증한다. 무효 원본은 errors/run 진단만 남기고 완료 표시를 생성하지 않는다.
- [ ] 동일 입력을 다른 출력 경로로 두 번 실행해 본문과 결정적 매니페스트의 바이트 일치를 확인한다. run의 시각·실행시간·process.resourceUsage().maxRSS는 일치 조건에서 제외하며 메모리 단위를 명시한다.
- [ ] RED 후 저장을 구현한다. 새 출력 경로와 같은 부모 아래 임시 디렉터리를 만들고 모든 파일 완성 후 rename한다. 출력 경로가 이미 존재하면 거부하고 기존 디렉터리는 보존한다.
- [ ] package scripts를 추가한다.

```json
"data:normalize-population": "tsx scripts/data/normalize-population.ts",
"data:compare-population": "tsx scripts/data/compare-population.ts"
```

- [ ] CLI 입력 JSON은 unknown부터 실행 시 검증한다. sourceId, 연월, asOfDate, hash, schemaVersion, 근거 status/version/evidenceIds, registry를 확인한다. 잘못된 설정은 종료 코드 1, 원본 검증 실패 또는 모든 동 비교 불가는 2, 정상 생성은 0이다. 일부 동의 unavailable은 0으로 종료하고 건수를 매니페스트에 기록한다.
- [ ] 세 contract에 기존 프로파일의 SHA-256을 옮겨 실제 ZIP과 대조한다. asOfDate는 2026-09-07이다. 방법 근거가 없는 초기 상태는 status unverified, version null, evidenceIds 빈 배열, registry null이다. 공식 근거를 만들어내지 않는다.
- [ ] 공식 산출 방식 자료를 읽기 전용으로 확인하고 자료 URL·확인일·대상 기간을 보고한다. 확인할 수 없으면 unverified를 유지한다. 원본 설명이나 사용자 제공 자료 보관이 필요하면 docs/references/를 사용한다.
- [ ] 다음 세 명령을 실행한다. 출력 경로가 존재하면 새로운 실행 이름을 사용하고 기존 결과는 보존한다.

```powershell
pnpm data:normalize-population -- --input data/raw/population/250_LOCAL_RESD_ADMDONG_202607.zip --contract data/source-contracts/population-202607.json --output-dir data/work/population-202607-run1
pnpm data:normalize-population -- --input data/raw/population/250_LOCAL_RESD_ADMDONG_202507.zip --contract data/source-contracts/population-202507.json --output-dir data/work/population-202507-run1
pnpm data:normalize-population -- --input data/raw/population/250_LOCAL_RESD_ADMDONG_202606.zip --contract data/source-contracts/population-202606.json --output-dir data/work/population-202606-run1
```

- [ ] 비교 CLI 실행 전 changes 입력의 빈 배열을 로컬 작업 파일로 작성한다. 위 세 출력 디렉터리, changes 파일, 신규 비교 출력 디렉터리를 인자로 실행한다. 빈 배열은 공식 변경 미확인을 뜻하며 변경이 없었다는 증거가 아니다.
- [ ] 결과 보고서에는 원본 hash, 전체 행 수, 오류 건수, 동별 complete/incomplete, 월 쌍별 코드 차이, 비교 mode별 건수, 방법 근거 status, coverageStatus, 실행시간, 최대 메모리, 재실행 hash 일치를 기록한다. 기존 보고서 숫자에 맞추기 위해 결과를 수정하지 않는다.
- [ ] README에 실제 새 CLI와 contract 작성법을 기록한다. handoff 현재 상태·이력을 갱신하고 D1에 전달할 계약과 미확인 근거를 명시한다.
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`를 실행한다. raw/work가 Git 대상에 들어가지 않았는지 확인한다. Workers 검증은 이번 완료 조건에서 제외한다.
- [ ] Task 5 소스·테스트·작은 contract·보고서만 커밋한다: `feat: add reproducible population normalization CLI`. GitHub에는 push하지 않는다.

## 계획 자체 검토와 인계

설계의 입력 형식·타입 검증은 Task 1–2, 월 슬롯 검증은 Task 3, 방법·코드·대체 비교는 Task 4, 저장·실패·재현성·실원본은 Task 5에 대응한다. Task 4의 무효 원본과 코드 부재 구분, Task 5의 완료 표시는 실행 경계를 구체화한다.

원본의 32개 헤더만 근거로 산출 방식 검증 완료를 선언하지 않는다. 공식 코드 목록이 없어도 관측된 동의 검증·집계 구현과 시험은 가능하지만 서울 전체 커버리지를 확정하지 않는다. 사용자 모델 전환 후 Task 1부터 같은 세션에서 순서대로 구현한다.
