# 생활인구 공개 전 검증 보완 실행 계획

> **For agentic workers:** 구현용 모델 전환을 확인한 뒤 superpowers:executing-plans로 작업별 실행한다. 사용자의 별도 요청 없이 하위 에이전트를 사용하지 않는다. 현재 설계 모델에서는 실행하지 않는다.

**Goal:** 월 산출물·실패 후보·비교 계약의 남은 오류를 보완해 D1 적재가 신뢰할 수 있는 입력을 만든다.

**Architecture:** 내부 집계는 보존하고 JSON 읽기/쓰기 경계에서 같은 검증기를 사용한다. 성공과 확정 실패의 형식을 구분하며, 손상 산출물은 실행 실패로 처리한다.

**Tech Stack:** 설치된 TypeScript, Node.js, Vitest, csv-parse, adm-zip, pnpm을 유지한다.

**Spec:** [D1 스냅샷·조회 설계](../specs/2026-09-07-d1-overview-design.md) 2절. 원래 [생활인구 설계](../specs/2026-09-07-population-normalization-design.md)의 비교 정책을 유지한다.

## 공통 제약과 범위

- 기준 커밋 30b017f, 브랜치 codex/population-validation-fixes. 설계 문서와 handoff의 기존 미커밋 변경을 보존한다.
- 이번 실행 계획은 D1 설계 2절의 선행 보완만 구현한다. D1·API·UI의 다음 단계는 문서 마지막에 별도 인수 기준으로 명시한다.
- 테스트 123개 통과와 task5-a/b 재현성은 과거 기록이다. 새 검증의 기대 숫자로 고정하지 않는다.
- 원본과 기존 work 출력은 보존하며 새 경로로 실행한다. 원본·work·비밀값을 커밋하지 않는다.
- method unverified, registry null을 실제 공식 근거 없이 승격하지 않는다.
- 로컬 검증 후 변경 파일을 지정해 커밋할 수 있다. push·Cloudflare 외부 작업은 명시 요청 전에는 수행하지 않는다.
- 각 작업은 새 실패 테스트 → 실패 원인 확인 → 구현 → 관련 테스트와 typecheck → handoff 기록 순서로 진행한다.

## Task 1 — 월 산출물 불변식

**Files:** 수정 src/data/population/month-result.ts, month-result.test.ts, artifact-output.test.ts, scripts/data/population-cli.test.ts. 기존 contract.ts의 날짜·입력 파서를 재사용한다.

**Interfaces:** parseMonthResult(value: unknown): MonthResult; toMonthResult(month: MonthAggregation): MonthResult. 공개 타입은 기존 MonthResult를 유지한다.

- [x] 현재 tests의 count=1 완결 월 fixture를 실제 월 일수×24 관측 수와 그에 맞는 sumMicros로 교체한다. 각 fixture 평균의 산술 일치를 확인한다.
- [x] 정상 외부 fixture를 복제해 기대 관측 수 1, 관측 양수/날짜 null, 빈 관측/양수 합계, 범위 밖 날짜, coverage/registry 불일치를 각각 거부하는 테스트를 작성한다.

```ts
const bad = structuredClone(validMonthFixture);
bad.dongs[0].expectedCount = 1;
expect(() => parseMonthResult(bad)).toThrow();
```

위 validMonthFixture는 테스트 파일 안에 완결 월의 실제 필수 필드로 선언한다. 기간 202602, 기대·관측 672, 합계 67200000000, 평균 100.000000, 최초/최종일 20260201/20260228을 사용한다.

- [x] parseDong에서 expectedCount === daysInMonth(period)*24를 요구한다. 양수 관측은 양끝 날짜 필수, 0이면 날짜 null·sumMicros="0" 필수다. complete는 첫날~마지막 날이어야 한다. 관측 수가 날짜 구간의 가능한 시간 수보다 크면 거부한다.
- [x] valid 결과는 동 배열이 비어 있지 않고 오류 건수·샘플이 없어야 한다. registry가 있으면 해당 월에 유효한 모든 코드와 정확히 일치해야 한다. 관측만 있는 경우 observed_only를 요구한다.
- [ ] counts는 양의 안전 정수, 합계도 안전 정수 범위이며 코드별 샘플 수는 해당 건수를 넘지 않아야 한다. 객체는 일반 레코드 또는 null prototype만 허용한다.
- [x] toMonthResult도 마지막에 parseMonthResult를 호출해 출력과 입력의 규칙을 공유한다. 오류가 있는 valid 집계를 빈 오류로 덮지 않는다. invalid 진단의 없는 건수를 임의로 1 생성하지 않는다.
- [x] 실행: `pnpm test -- src/data/population/month-result.test.ts src/data/population/artifact-output.test.ts scripts/data/population-cli.test.ts`, `pnpm typecheck`. 잘못된 입력 거부와 정상 왕복을 확인하고 기록한다.

## Task 2 — 버전 있는 성공·실패 산출물

**Files:** 수정 artifact-output.ts/test.ts, normalize-population.ts, population-cli.test.ts. 새 src/data/population/artifact-contract.ts/test.ts에 외부 봉투 검증을 분리한다.

**Interfaces:** 성공 reader의 MonthAggregation 반환은 유지한다. readCandidateOutcome은 success의 monthly 또는 invalid의 검증된 MonthResult를 반환한다. Record<string, unknown> 진단 반환과 이중 타입 단언을 제거한다.

- [x] 해시는 맞지만 내용이 잘못된 monthly, 지원하지 않는 formatVersion, complete가 있는데 해시 불일치하며 errors도 있는 디렉터리, 실패 파일만 일부 존재하는 디렉터리를 거부하는 테스트를 작성한다.
- [x] 성공 manifest는 formatVersion=2, kind, 처리 버전, 입력 원본 해시·계약 해시, 내용 파일 해시를 가진다. run의 실행 시각·로컬 경로는 manifest에 넣지 않는다. complete는 formatVersion=2, manifestSha256, runSha256를 갖는다.
- [x] monthly 바이트를 한 번 읽어 해시 확인 후 동일 Buffer를 JSON 파싱한다. run도 한 번 읽어 해시·kind·period·계약·원본 참조의 일치를 검사한다.

```ts
const bytes = await readFile(monthlyPath);
if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
  throw new Error("population monthly.json hash mismatch");
}
const result = parseMonthResult(JSON.parse(bytes.toString("utf8")));
```

- [x] 실패 출력은 errors.json에 검증된 invalid MonthResult, run.json에 입력/원본/처리 계약을 기록한다. 마지막에 failure.json을 쓰며 formatVersion=2, kind=population-normalization-failure, errorsSha256, runSha256를 포함한다. 실패에는 complete·monthly·성공 manifest를 두지 않는다.
- [x] reader는 complete 존재 시 성공 검증만 수행한다. complete와 failure가 함께 있으면 손상으로 거부한다. complete가 없을 때만 failure 봉투를 검증하며 missing marker를 invalid로 추정하지 않는다. 해시는 무결성 확인이지 외부 서명 인증이 아님을 문서에 명시한다.
- [x] samples=[]인 실제 오류 건수 양수 실패도 정상 invalid로 읽는다. 레거시 출력은 명확한 unsupported format 오류로 거부하고 원본 재처리를 안내한다.
- [x] 실제 normalize CLI가 생성한 성공/실패 fixture를 reader로 검증한다. 실행: artifact-contract, artifact-output, population-cli 테스트와 typecheck. 형식 변경을 README와 실행 기록에 반영한다.

## Task 3 — 경계 날짜와 비교 CLI

**Files:** 수정 src/data/population/compare-months.ts/test.ts, scripts/data/compare-population.ts, population-cli.test.ts.

**Interfaces:** parseAreaChanges(value: unknown): AreaChange[] 유지. compareMonths는 입력 변경 목록도 검증한다. 후보별 기간과 reasons를 보존하며 기존 내부 호환 필드는 D1 연결 때 제거 여부를 따로 정한다.

- [x] 전년 후보 202507에 대해 2025-07-01 변경은 전체 후보가 변경 후 기준이므로 허용하고, 2025-07-15 변경은 차단하는 테스트를 만든다. 현재 월 마지막 날 변경도 차단하고 다음 달 첫날은 영향을 주지 않아야 한다.

```ts
const start = `${previousYear.period.slice(0, 4)}-${previousYear.period.slice(4)}-01`;
const crosses = change.effectiveDate > start && change.effectiveDate <= currentMonthEnd;
```

- [x] 일반 후보의 경계 변경·코드 부재는 전월 대체 사유가 아니다. 무효 전년 원천은 코드 부재로 해석하지 않고 invalid_source로 평가한다. 알려진 경계 변경이 있는 경우에는 전년 원천 무효라도 자동 비교를 허용하지 않는 보수적 정책을 유지한다.
- [x] boundary 차단도 candidateFailures에 후보 기간과 사유를 남긴다. 평가하지 않은 후보의 실패를 만들지 않는다. fallbackReason은 실제 전년 실패 사유를 사용하고 성공 전월을 failures에 넣지 않는다.
- [x] args와 변경 JSON은 원본 읽기 전에 검증한다. 잘못된 설정·후보 기간은 PopulationConfigurationError로 코드 1, 해시/형식 손상은 코드 2다.
- [x] invalid MonthResult를 내부 invalid 집계로 바꾸는 변환기는 타입 검증된 필드만 사용한다. unknown 이중 단언을 제거한다.
- [x] 실제 CLI 테스트: 정상 현재·실패 전년·정상 전월은 previous_month, comparisonPeriod=202606, candidateFailures의 202507 invalid_source를 출력한다. 잘못된 changes는 1, 손상 완료 파일은 2이며 비교 결과를 발행하지 않는다.
- [x] 값 150/100은 차이50·50%, 150/120은 차이30·25%, 이전0은 비율만 null을 검증한다. 실행: compare-months 및 population-cli 테스트, typecheck.

## Task 4 — 파일 경계와 실행 측정 정정

**Files:** 수정 read-rows.ts/test.ts, artifact-output.ts/test.ts, normalize-population.ts, population-cli.test.ts. 필요 시 새 src/data/population/output-path.ts/test.ts로 경로 검증을 분리한다.

**Interfaces:** 기존 bytes reader를 유지한다. 출력 writer에는 명시적 workRoot 옵션을 추가하고 CLI는 프로젝트 data/work를 전달한다. 테스트는 임시 프로젝트의 data/work를 사용한다.

- [x] readPopulationRows의 stat 선검사를 복원하고 설정 값은 읽기 전에 검사한다. 실제 읽은 Buffer 길이도 재검사한다. 파일이 읽는 중 커지는 경우의 하드 제한은 한 번 열린 핸들에서 제한 길이로 읽는 방식을 사용한다.
- [x] outputDir는 workRoot의 엄격한 하위 경로여야 한다. workRoot 자체·상위 탈출·기존 링크/재분석 지점 경유를 거부한다. 현재 미존재 경로는 가장 가까운 기존 부모의 실제 경로부터 검증한다.
- [x] 동일 출력에 두 writer가 경합하면 정확히 하나만 성공해야 하며, 실패한 writer는 자신의 staging만 정리해야 한다. 성공본 해시와 기존 출력 보존을 확인한다.
- [x] maxRssBytes는 현재값이므로 우선 rssAtEndBytes로 정정한다. 시작/종료 시각, elapsedMs의 측정 구간(입력 로드 시작~집계 완료)을 명시한다. 실제 최대 RSS 요구는 별도 high-water 측정이 검증되기 전까지 미완료로 남긴다.
- [x] 0과 00 시간 중복, 윤년 696슬롯, 행 순서 역전, 중복으로 총 행 수를 맞춘 누락의 회귀 사례를 추가한다. 기존 Uint8Array 구현을 보존한다.
- [x] 실행: read-rows, aggregate-month, artifact-output, population-cli 테스트, lint, typecheck. README의 메모리 측정 표현을 실제 필드에 맞춘다.

## Task 5 — 새 형식 실원본 인수 검증

**Files:** 문서 docs/data/2026-09-07-population-normalization.md, handoff.md, 본 계획. 실행 결과는 Git 제외 data/work 하위에만 생성한다.

- [x] 202507/202606/202607의 기존 raw ZIP과 source-contract를 확인하고 새 고유 work 경로를 정한다. 각 원본을 두 번 정규화한다.
- [x] 파일 SHA-256뿐 아니라 새 reader로 두 성공 산출물을 검증한다. monthly와 manifest 동일성, sumMicros·관측/누락 수·평균·날짜가 기존 task5 결과와 같은지 비교한다.
- [x] 새 비교 CLI를 두 실행 세트에 적용하고 출력 본문 동일성과 후보별 사유를 확인한다. 전체 unavailable이면 코드 2가 예상되지만 결과를 읽어 원천 손상과 구분한다.
- [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`를 실행한다. 새 코드 수정이 없으면 같은 검사를 불필요하게 반복하지 않는다.
- [x] `git check-ignore`로 raw/work 산출물 제외를 실제 확인한다. 진단 보고에 실행 명령·기간·해시·건수·실패 이유·측정 구간을 남긴다. 공식 근거 미확인은 유지한다.
- [x] 완료한 항목만 체크하고 handoff 현재 상태와 이력을 함께 갱신한다. 검증된 파일만 로컬 커밋하며 push하지 않는다.

## 후속 단계: D1 → API → 화면

이 부분은 의존 순서와 인수 기준이다. 위 Task 1~5 완료 후 각 단계의 상세 실행 계획을 설계 모델에서 작성한다. 현재 계획이 DB/화면 전체 구현까지 승인된 것으로 해석하지 않는다.

| 단계 | 구현 위치 제안 | 입력·출력 | 인수 기준 |
| --- | --- | --- | --- |
| 로컬 D1 저장 | migrations/, src/data/snapshots/, src/data/repositories/ | 검증된 버전 → 불변 스냅샷·공개 포인터 | 중복 재실행·부분 적재 비공개·조건부 포인터 경합·복구 검증 |
| 조회 API | src/app/api/dongs/route.ts, src/app/api/dongs/[code]/overview/route.ts | 고정 snapshotId → 검색/overview | 400/404/503·unavailable·소수 정밀도·한 요청 버전 고정 |
| 검색·상세 UI | src/app/page.tsx, src/app/dongs/[code]/page.tsx | 조회 응답 → 기준기간·지표 상태·출처 | loading/empty/error/available/unavailable·키보드·모바일 검증 |

D1 후속 설계에서는 comparison_set의 부모 테이블과 입력 원천 실패 참조를 구체화한다. published 이전 스냅샷으로 복구할 수 있도록 상태 판정은 validated 또는 published를 허용하고 public_channels가 실제 공개 여부를 결정하도록 정리한다. 코드 공개용 명칭 목록 근거와 통계 경계 검증 근거는 서로 대체하지 않는다.

현재 설계 검토에서의 신규 파일은 이 계획과 기존 설계 문서다. 앱 구현·D1 생성·배포는 실행하지 않았다.
