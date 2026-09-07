# 생활인구 정규화 잔여 구현 검토·인계 계획

> **For agentic workers:** 구현용 모델 전환을 사용자가 확인한 다음에만 superpowers:executing-plans로 순서대로 실행한다. 일반적인 “진행”은 설계 모델에서 코드 구현을 재개하라는 뜻이 아니다. 사용자 요청 없이 하위 에이전트를 사용하지 않는다.

**Goal:** 기존 정규화의 미커밋 변경을 보존하고, 승인 설계의 산출물·비교 계약과 실패 처리·재현성을 구현 가능한 단위로 마무리한다.

**Architecture:** 내부 집계와 외부 JSON 계약을 구분한다. JSON 경계에서 검증한 결과만 비교에 전달하며 성공 산출물과 실패 진단의 읽기 경로를 명시적으로 분리한다.

**Tech Stack:** 저장소에 설치된 TypeScript·Node.js·Vitest·csv-parse·adm-zip을 유지한다. 이 계획 작성에서는 코드·설정·의존성을 변경하지 않는다.

**Spec:** ../specs/2026-09-07-population-normalization-design.md 및 기존 계획 2026-09-07-population-normalization.md의 공통 계약을 기준으로 한다.

## 작업 경계와 기준점

- 검토 기준: codex/population-validation-fixes, HEAD 3f5c041.
- c9b8ae9와 3f5c041은 로컬 커밋이다. 원격 main은 앞선 푸시 결과 기준 716e6d7이며 이번 검토에서 원격을 조회하지 않았다.
- 오류/스트림 보완 코드와 테스트는 미커밋이다. errors.ts도 새 파일로 남아 있으므로 누락하거나 초기화하지 않는다.
- 이전 실행 기록: 테스트 115개·lint·typecheck·Next build 통과. 이번 검토에서 다시 실행한 결과로 표현하지 않는다.
- 이번에 허용된 작업은 설계 검토와 문서 편집이다. 코드 수정·커밋·푸시·원본 재처리·Cloudflare 작업을 수행하지 않는다.
- 동일 코드 비교, 근거 미확인 유지, 무효 원본의 공개 후보 금지, 슬롯 누락 시 평균 null, 원본/작업 파일 Git 제외는 기존 합의를 유지한다.

## 코드 대조 결과

| 우선순위 | 실제 확인한 위치 | 확인된 차이와 영향 | 실행 Task |
| --- | --- | --- | --- |
| 높음 | artifact-output.ts:67–81 | JSON.parse 후 타입 단언과 BigInt 변환만 수행한다. 해시가 일치하는 잘못된 count/mean/코드/기간도 의미 검증이 부족하다. | 1 |
| 높음 | compare-population.ts:10–15, artifact-output.ts:67 | 모든 후보를 complete.json이 필요한 동일 읽기 함수로 읽는다. 정상적으로 실패한 원본도 CLI 전체를 종료시켜 invalid_source 전월 대체에 도달하지 못한다. | 2 |
| 높음 | compare-months.ts:4–17, compare-population.ts:15 | 변경 이력에 날짜·근거·종류가 없고 JSON을 타입 단언한다. 승인된 AreaChange 계약과 다르다. 비교 사유도 기간별로 분리되지 않는다. | 3 |
| 중간 | artifact-output.ts:38,55 | 결정적 manifest에 run.json 해시가 들어 있다. 실행 시각/시간을 추가하면 동일 원본의 manifest도 달라진다. | 2 |
| 중간 | normalize-population.ts:29–37, read-rows.ts:120 | 해시를 계산한 원본과 파싱 원본을 별도로 연다. 두 읽기 사이 파일이 교체되면 해시가 실제 처리 바이트를 설명하지 않을 수 있다. 실제 교체 발생을 관찰한 것은 아니다. | 4 |
| 중간 | aggregate-month.ts:51 | 모든 슬롯을 문자열 Set으로 보관한다. 계획의 동별 Uint8Array 및 최대 메모리 측정이 남아 있다. | 4 |
| 중간 | 현재 계약·보고서 | version/evidenceIds 형식 검사는 구현됐으나 공식 근거 내용과 대상 기간은 미확인이다. | 5 |

그 밖의 차이: 현재 MonthAggregation은 레코드형 dongs·선택적 input/coverage/diagnostics이고, 승인된 외부 MonthResult는 정렬된 동 배열·필수 input/coverage/errors다. 내부 BigInt 자체는 문제 없지만 외부 계약을 확정하지 않은 상태로 D1에 연결하면 안 된다.

## Task 0 — 미커밋 변경 인수

**Files:** 현재 git status에 나온 src/data/population, scripts/data 변경과 관련 문서.

- [x] 사용자에게서 구현용 모델 전환을 확인하고 handoff에 기록한다.
- [x] git status와 diff를 읽어 errors.ts를 포함한 미커밋 범위를 확인한다. 기존 변경을 삭제하거나 재작성부터 시작하지 않는다.
- [x] pnpm test, pnpm lint, pnpm typecheck를 실행한다. 115개라는 과거 숫자에 결과를 맞추지 않는다.
- [ ] 변경된 오류/스트림 코드의 유지 여부를 리뷰하고, 수정이 필요하면 실패 테스트부터 추가한다.
- [ ] 검증한 파일만 지정해 로컬 커밋한다. 푸시는 이 계획의 실행 단계가 아니다.

## Task 1 — 외부 월 JSON 계약과 런타임 검증

**Files:** 새 src/data/population/month-result.ts 및 month-result.test.ts; types.ts, aggregate-month.ts, artifact-output.ts와 해당 테스트.

**Interfaces:** 기존 계획의 MonthResult/DongMonth 타입을 외부 JSON에 사용한다. 내부 MonthAggregation에서 toMonthResult(aggregate)로 변환하고 parseMonthResult(value: unknown)로 읽기 검증한다. 내부 계산은 BigInt, 외부 sumMicros는 십진 문자열이다.

- [ ] 기존 공통 계약을 types.ts에 단일 정의한다. input·coverageStatus·errors는 필수다. 외부 status는 valid/invalid이며 valid의 개별 동은 complete/incomplete다.
- [ ] 아래 입력 거부 테스트를 먼저 작성한다.

```ts
// 각 사례는 나머지 필드가 정상인 월 fixture의 단일 필드만 바꾼다.
// count=0인데 complete; missingCount=-1; 중복 dongCode; 잘못된 period;
// sumMicros="1e3"/"-1"; 누락 동 mean이 숫자; mean과 합계/관측 수 불일치.
expect(() => parseMonthResult({})).toThrow();
```

- [ ] 동별 expectedCount=해당 월 일수×24, observedCount는 0..expectedCount 정수, missingCount=차이, missingRate=비율, 날짜는 기간 안의 실제 날짜인지 검사한다. observedCount=0이면 최초/최종일은 null, complete이면 평균이 formatMean과 같아야 한다.
- [ ] invalid는 dongs 빈 배열과 오류 전체 건수>0을 요구한다. 표본은 최대 20개, 전체 건수와 모순되지 않아야 한다. 위치를 알 수 없는 파일 수준 오류는 line=null을 허용한다.
- [ ] 코드 정렬·선행 0 보존·왕복 JSON 변환을 테스트한다. 런타임 객체의 prototype/알 수 없는 필드가 검증을 우회하지 않게 일반 레코드부터 검사한다.
- [ ] 기존 run1/validation2/contract3/stream4는 보존한다. 새 출력 형식 버전을 명시하고 레거시 출력은 명시적 오류로 거부하거나 검증된 별도 변환기로만 읽는다. 무조건 타입 단언하는 호환 경로는 만들지 않는다.
- [x] 테스트 명령: pnpm test -- src/data/population/month-result.test.ts src/data/population/artifact-output.test.ts; pnpm typecheck.

## Task 2 — 성공/실패 읽기와 결정적 매니페스트

**Files:** artifact-output.ts/test.ts, normalize-population.ts, compare-population.ts, population-cli.test.ts.

**Interfaces:** readMonthlyOutput은 성공 산출물만 읽는다. 새 readCandidateOutcome(directory)는 검증된 MonthResult를 반환하며, 성공 산출물 또는 명시적 실패 진단을 읽는다. 실패 진단도 input.period와 원천 실행 상태를 검증한다.

- [x] 성공 읽기에 Task 1의 parseMonthResult를 적용한다. 해시 계산에 사용한 바이트를 그대로 JSON 파싱하고 같은 파일을 다시 열어 읽지 않는다.
- [x] 실패 진단에 input·원본 식별·오류 건수를 남긴다. run의 kind/status/period와 errors의 기간·상태가 모두 일치하는 경우에만 invalid 결과로 전달한다. complete 누락만으로 실패 결과를 만들어내지 않는다.
- [ ] 실패 전년+정상 현재/전월 fixture로 실제 CLI가 previous_month와 invalid_source 사유를 기록하는지 검증한다. 반면 임의 빈 디렉터리·손상 JSON·해시 불일치는 전체 실행 오류로 거부한다.
- [x] 결정적 manifest에는 내용 파일 해시와 원본·처리 계약/버전만 둔다. 비결정적 run의 해시는 complete에서 별도로 검증하는 구조를 제안한다. 이는 모든 파일 무결성 확인과 manifest 재현성을 동시에 충족하기 위한 구체화다. 형식 버전을 올려 기존 소비자와 구분한다.
- [ ] 완료 파일은 마지막에 작성한다. 임시 디렉터리에서 최종 확정하고 기존 출력은 보존한다. 출력 경로가 사전에 존재하는 경우와 같은 출력으로 두 실행이 경합하는 경우를 모두 검증한다.
- [ ] 로컬 work 저장소 아래로 출력 경로를 제한한다. 경로 이탈·심볼릭 링크/재분석 지점 우회도 검사한다. 테스트는 임시 프로젝트 루트 아래 data/work를 사용한다.
- [ ] 동일 원본을 다른 출력 위치/실행 시각으로 두 번 처리한다. monthly/manifest 바이트는 동일, run/complete 차이는 허용하며 두 실행 모두 해시 검사에 통과해야 한다.
- [ ] 테스트 명령: pnpm test -- src/data/population/artifact-output.test.ts scripts/data/population-cli.test.ts; pnpm typecheck.

## Task 3 — 날짜·근거 기반 변경 이력과 후보별 비교 결과

**Files:** compare-months.ts/test.ts, types.ts, compare-population.ts, population-cli.test.ts; 새 area-change.ts/test.ts.

**Interfaces:** parseAreaChanges(value: unknown): AreaChange[]; AreaChange와 DongComparison은 기존 계획의 필드명을 따른다. candidateFailures는 각 period와 reasons를 묶는다.

- [x] code(8자리), effectiveDate(실제 YYYY-MM-DD), evidenceId(공백 아닌 문자열), kind(boundary_change/retired/created)를 검사한다. 빈 배열은 미확인이지 변경 없음의 증명이 아니다.
- [x] 월 단위 effectivePeriod를 실제 날짜 계약으로 전환한다. 비교 후보 월중 변경도 격리한다. 후보 월 첫날 적용된 변경과 중간 적용된 변경을 구분하는 날짜 테스트를 만든다. 정상 전년 후보의 경계 변경/코드 부재를 이유로 전월 자동 대체하지 않는 기존 정책은 유지한다.
- [ ] 현재 유효성 → 코드/공식 변경 → 후보 스키마/방법/완결성 순서와 허용된 전월 대체를 검증한다. 실패 원천의 빈 코드 집합을 공식 코드 부재로 해석하지 않는다.
- [x] comparisonMode/Period, fallbackReason, candidateFailures, codeMatchBasis, currentMean/previousMean, difference, percentChange, percentUnavailableReason을 출력한다. 같은 실패명이 두 후보에 있어도 각각의 기간에 남긴다.
- [ ] 손계산 사례: 150 대 100은 차이 50/50%; 전월 120 대체는 30/25%; 이전 0은 차이 유지/비율 null. 음수 반올림·음의 0 제거와 반올림된 평균이 아닌 원 합계/관측 수 계산도 검사한다.
- [ ] 잘못된 flags/changes/후보 기간은 코드 1, 원천 실패 또는 전부 unavailable은 2, 일부 비교 가능하면 0이다. 손상 산출물은 비교 불가 통계로 숨기지 말고 명시적 실행 실패로 보고한다.
- [ ] 테스트 명령: pnpm test -- src/data/population/compare-months.test.ts src/data/population/area-change.test.ts scripts/data/population-cli.test.ts; pnpm typecheck.

## Task 4 — 동일 원본 바이트 보장·슬롯 메모리·실원본 재현

**Files:** read-rows.ts/test.ts, aggregate-month.ts/test.ts, normalize-population.ts, population-cli.test.ts.

- [x] 읽기와 해시가 동일한 원본 바이트를 사용하도록 책임을 read-rows의 원본 로딩 경계로 모은다. CLI가 먼저 별도 원본을 해시하고 다시 여는 경로를 제거한다. 기대 SHA-256 검사 뒤 그 버퍼에서 엔트리를 파싱한다.
- [x] 슬롯을 동별 Uint8Array(days×24)로 바꾼다. 슬롯 인덱스는 (day-1)×24+hour, 값이 이미 1이면 duplicate_slot이다. 유효 슬롯 수는 별도 정수로 집계한다.
- [ ] 숫자 시간 0/문자열 00 중복, 전체 행 수를 맞춘 중복+누락, 윤년 696슬롯, 입력 역순 결과 일치를 검증한다.
- [x] run에 실행 시각·경과시간·최대 RSS와 단위·런타임/처리 버전을 기록한다. 플랫폼 단위를 확인하고 문서에 적는다. 런타임 메타데이터를 결정적 manifest에 넣지 않는다.
- [ ] 세 실제 원본을 각각 새 data/work 경로로 두 번 실행한다. 본문/manifest 동일성, 행 수·동 수·오류·비교 사유 건수와 메모리를 기록한다. 과거 숫자는 회귀 비교용이며 결과를 강제로 맞추지 않는다.
- [ ] 테스트 명령: pnpm test -- src/data/population scripts/data/population-cli.test.ts; pnpm typecheck.

## Task 5 — 공식 근거 확인과 최종 인계

**Files:** docs/references/에 필요한 원본 보존; data/source-contracts, docs/data/2026-09-07-population-normalization.md, README.md, handoff.md.

- [ ] 공식 자료를 읽기 전용으로 확인하고 URL·확인일·해당 기간·검토 결론을 기록한다. 실제 동일 방법/버전 확인이 없으면 method unverified를 유지한다. 동일 헤더나 동일 OA ID만으로 verified로 올리지 않는다.
- [ ] 공식 행정동 목록과 변경 이력이 확보되지 않으면 registry=null/observed_only를 유지한다. 변경 코드의 이름 매칭이나 환산은 범위 밖이다.
- [ ] 검증된 공개 계약·미확인 근거·새 CLI 예시·실행 결과를 README와 handoff에 반영한다.
- [ ] pnpm test, pnpm lint, pnpm typecheck, pnpm build, git diff --check를 실행하고 raw/work 제외를 확인한다.
- [ ] 이 계획의 항목별 완료 근거를 기록한다. 구현용 모델에서 검증한 로컬 파일만 커밋한다. UI/D1 설계 전환 시 사용자에게 모델 전환 시점을 다시 알린다.

## 설계 검토 결론

현재 입력/관측/집계·일부 비교/오류·청크 읽기는 보존할 기반이 있다. UI/D1에 곧바로 연결하기보다는 Task 1→2→3으로 외부 산출물 경계를 확정하는 것이 우선이다. Task 4는 재현성과 운영 비용의 근거를, Task 5는 통계 비교의 실제 의미적 근거를 완성한다.

이 문서는 다음 구현 모델의 작업 지침이며 현재 모델에서 실행하지 않는다. 다음 대화의 일반 “진행”도 모델 전환 확인 전에는 설계/검토 범위로 해석한다.
