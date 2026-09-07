# D1 스냅샷 저장·동네 조회 연결 설계안

작성일: 2026-09-07. 상태: 검토용 설계안, 구현 전. 기준 커밋: 30b017f.

기존 [데이터 파이프라인 설계](2026-09-04-data-pipeline-and-map-design.md)와 [생활인구 설계](2026-09-07-population-normalization-design.md)를 구체화한다. 이번 작업은 문서 작성이며 D1 생성·마이그레이션·앱 코드 변경·push를 포함하지 않는다.

## 1. 범위와 선택

목표는 검색 → 행정동 선택 → 동일 스냅샷의 지표·기준기간·비교 불가 사유 확인이다. 저장 구조, 공개 조건, 조회 계약을 먼저 고정한다. 차트·지도 전체 구현과 상권 정규화는 각각 후속 구현 단위다.

세 접근을 비교했다.

| 접근 | 장점 | 제약 |
| --- | --- | --- |
| 검증된 스냅샷을 D1에 적재하고 공개 포인터 교체 | 출처 추적·이전 공개본 복구·일관된 조회 | 적재 검증과 공개 단계 필요 |
| CLI JSON을 화면에서 직접 읽기 | 로컬 시연이 빠름 | 운영 경로·출처·부분 파일 관리가 화면과 결합 |
| 모든 공식 근거 확보까지 저장·조회 개발 보류 | 의미 검증 이후에만 연결 | unavailable 화면과 저장 기능도 검증하기 어려움 |

첫 번째를 제안한다. 로컬 fixture로 저장·조회 흐름을 개발하고 실제 검토용 적재와 사용자 공개를 구분한다. 공식 근거 미확인 상태는 임의 승격하지 않는다.

## 2. 현재 코드 대조와 공개 전 필수 보완

123개 테스트와 실원본 이중 실행 성공은 이전 실행 기록이다. 이번 설계 검토에서는 다시 실행하지 않았다. 반복 파일 일치만으로 아래 계약 검증 완료를 대신할 수 없다.

| 실제 코드 | 확인한 잔여 항목 | 인수 조건 |
| --- | --- | --- |
| month-result.ts parseDong | expectedCount가 해당 월 일수×24인지 검사하지 않음. 관측 양수인데 날짜 null 허용 | 잘못된 기대 수·날짜·빈 관측의 양수 합계 거부, coverage와 registry 일치 검증 |
| artifact-output.ts readMonthlyOutput | 해시 검사한 monthly 파일을 다시 읽어 파싱 | 동일 바이트를 검증·파싱, 출력 형식 버전 명시 |
| artifact-output.ts readCandidateOutcome | 성공 읽기의 모든 오류 후 실패 읽기 시도, 진단 내부 건수·입력 계약 미검증 | 손상된 완료 산출물은 실패 후보로 대체하지 않음. 확정된 실패 실행의 기간·계약·해시·진단을 검증 |
| compare-months.ts changed | 전년 후보 월말 이후만 검사해 후보 월중 변경 누락 | 후보 월 첫날 적용과 월중 적용을 구분. 월중 변경은 해당 비교 차단 |
| compare-population.ts | 설정 오류도 최종 catch에서 코드 2, diagnostics 이중 타입 단언 | 설정/기간 오류 코드 1, 손상 원천 코드 2, 실패 후보 fallback CLI 통합 시험 |
| normalize-population.ts maxRssBytes | 처리 종료 시점 rss를 최대 RSS라는 이름으로 기록 | 현재값으로 이름을 정정하거나 실제 최대값과 측정 방법 기록 |
| read-rows.ts / artifact-output.ts | 일반 파일 리더의 읽기 전 크기 제한과 출력 work 경로 제한 보완 필요 | 크기 초과를 읽기 전에 거부, 출력 경로 이탈·동시 출력 충돌 검증 |

이 항목은 설계 모델에서 수정하지 않는다. 다음 구현 모델의 첫 작업으로 인계한다. 기존 완료 체크박스보다 이 대조 기록을 우선한다.

## 3. 저장 단위

수정된 원본·재집계 결과가 같은 월의 이전 결과를 덮지 않도록 버전을 키에 포함한다. 아래 표는 논리 스키마이며 실행 SQL은 구현 단계에서 작성한다.

| 테이블 | 키·핵심 필드 | 역할 |
| --- | --- | --- |
| evidence_documents | id, 공식 URL, 문서 해시, 확인일, 적용기간, 검토 상태 | 방법·명칭·경계의 근거 |
| source_artifacts | id, source_id, period, sha256, byte_length, 공식 URL, 저장 키 | 원본 버전, source_id+period+sha256 유일 |
| population_versions | id, artifact_id, contract_hash, processor_version, output_hash, input_json, validation_status, coverage_status | 월 산출물과 처리·근거 계약 연결 |
| population_monthly | version_id+dong_code, expected_count, observed_count, missing_count, first_date, last_date, sum_micros, mean, status | 월별 동 관측값 |
| dong_registry_versions | id, evidence_id, 기준일 | 이름·코드 목록 버전 |
| dong_registry_entries | registry_version_id+code+valid_from, name, district_name, valid_to_exclusive | 출처가 확인된 이름과 유효기간 |
| population_comparisons | comparison_set_id+dong_code, current_version_id, year_version_id, month_version_id, policy_version, result_json | 검증한 비교 결과와 후보별 사유 |
| snapshots | id, status, registry_version_id, 구성 해시, 검증 보고 해시, created_at | building → validated → published 또는 rejected |
| snapshot_members | snapshot_id+지표종류+기간, version_id | 해당 공개본이 사용하는 고정 버전 |
| public_channels | name, snapshot_id, generation | 현재 공개본 포인터 |
| ingestion_runs | id, 원본/산출물 ID, 시작·종료, 실행 상태, 측정 메타데이터 | 재실행 이력, 공개 데이터와 별개 |

코드·기간·정확한 십진 합계/평균은 TEXT, 제한된 관측 수는 INTEGER로 저장한다. sum_micros는 JS Number나 SQLite REAL로 변환하지 않는다. 평균은 저장된 합계/관측 수에서 검증하며 누락률은 정수 카운트에서 계산한다. SQL CHECK와 애플리케이션 검증을 함께 사용한다.

동명이거나 이름이 바뀌어도 코드·유효기간 기준으로 구분한다. 관측 파일에서 발견한 코드로 공식 명칭을 만들어내지 않는다. 미등록 관측은 검토용 산출물에 보존하고 검색 인덱스에는 넣지 않는다.

## 4. 적재와 공개

1. 원본 해시·계약·출력 형식·월 불변식·근거를 검증한다.
2. 불변 버전과 building 스냅샷 아래에 나누어 적재한다. 동일 콘텐츠 키로 재시도하면 중복을 만들지 않는다.
3. 적재 개수·참조 버전·검증 보고를 확인한 뒤 validated로 고정한다. 이후 해당 스냅샷의 구성은 수정하지 않는다.
4. 단일 조건부 갱신으로 공개 포인터를 바꾼다. WHERE에 예상 generation과 validated 상태를 포함하고 변경 행 수가 1인지 확인한다. 경합에서 패한 실행은 재검토하며 무조건 덮어쓰지 않는다.
5. API는 요청 시작에 snapshot_id를 한 번 고정하고 모든 하위 조회에 전달한다. 변경 중인 공개 포인터를 지표마다 다시 조회하지 않는다.

대량 적재 전체가 여러 batch에 걸쳐 원자적이라고 가정하지 않는다. 실패한 building 버전은 공개되지 않으며 이전 포인터를 유지한다. 복구는 검증된 이전 스냅샷으로 조건부 포인터 변경하며 데이터 삭제를 요구하지 않는다.

D1의 prepared statement/bind와 batch 트랜잭션 특성은 [공식 D1 문서](https://developers.cloudflare.com/d1/worker-api/d1-database/)를 2026-09-07 확인했다. 공개 포인터 방식은 이 특성을 사용하는 프로젝트 설계 제안이다.

## 5. 공개 기준과 API

원천 무효는 적재 진단으로만 남긴다. 의미적 근거 미확인은 지표 unavailable로 표현한다. 공개 이름 목록 자체가 없으면 실제 검색 공개를 보류하고 로컬 테스트용 목록만 사용한다.

`GET /api/dongs?query=`: NFC·양끝 공백 정규화, 2~40자, 결과 최대 20개. 자치구+동명 및 동명 접두 검색, 자치구·동명·코드 순 정렬. 초기 초성·퍼지 검색은 제외한다. 빈 검색은 빈 배열, 형식 오류는 400이다.

`GET /api/dongs/{code}/overview`: 코드 형식 오류 400, 공개 목록에 없는 코드 404, 공개 스냅샷이 없으면 503(data_not_ready). 등록된 동에 지표만 없으면 200과 unavailable 지표를 반환한다. 응답은 apiVersion, snapshotId, 기준일, 동 기본정보, store, population, neighbors를 포함한다.

population은 status(available/unavailable), currentPeriod, currentMean, comparisonMode, comparisonPeriod, previousMean, difference, percentChange, reasonCodes, candidateFailures, coverageStatus, sourceReferences를 가진다. 숫자는 십진 문자열 또는 null이다. 현재값과 비교값의 공개 가능성을 각각 검사한다. 방법 근거가 미확인인 실제 생활인구 값은 이 초기 공개 정책에서 숨기고 reasonCodes에 method_unverified를 남긴다. 슬롯 완결만으로 공개하지 않는다.

검증된 현재값에 대해 이전 값이 0이면 차이는 유지하고 비율만 null, previous_value_zero를 표시한다. registry 미확인은 행정동 경계 검증 완료라는 표현을 금지한다. 비교가 불가능한 기간을 연결해 추세선으로 그리지 않는다.

상권·인접 데이터 준비 전에는 각각 unavailable이다. 원본을 준비하지 않은 최근 12개월의 빈 기간을 보간하거나 0으로 채우지 않는다. 실제 최신 수집 월과 공식 사이트의 최신 제공 월을 구분한다.

## 6. 화면 연결

홈 검색 → 동네 상세 페이지(`/dongs/{code}`) → 다른 동네 검색 순으로 구성한다. 첫 화면은 자치구/동명·기준기간, 핵심 지표 카드, 기간별 자료 상태, 출처 순서다. 기존 반투명·라운드 토큰과 모바일 1열 배치를 유지한다.

생활인구 미확인 상태에는 “자료 기준을 확인 중이에요”와 확인되지 않은 항목을 보여준다. unavailable 카드에 증가 화살표나 0%를 표시하지 않는다. 12개월 관측이 없으면 연간 추세 대신 확보된 기간 목록을 제공한다. 인접 경계 근거가 없으면 지도를 추정해서 만들지 않는다.

서버 조회는 동일 repository 인터페이스를 사용하고 snapshotId를 화면 응답 및 클라이언트 캐시 키에 포함한다. 상세 경로 변경 시 이전 동의 응답이 새 동을 덮지 않게 한다. 요약 문구는 응답 필드만으로 생성한다. 출처에는 공개 URL과 기간만 보이며 로컬 경로·내부 스택은 제외한다.

## 7. 구현 순서와 검증 기준

1. 위 공개 전 보완 목록을 회귀 테스트와 함께 완료한다. 기존 Task 1~5의 실제 완료 여부를 다시 기록한다.
2. 로컬 D1 스키마·저장 repository·fixture로 버전 중복, 참조 무결성, 부분 적재 비공개, 포인터 경합·복구를 검증한다.
3. 조회 API에서 400/404/503과 지표별 unavailable, 문자열 소수 정밀도, 한 요청의 snapshot 고정을 검증한다.
4. 검색·상세 UI에서 loading/empty/error/unavailable/available 상태와 키보드 탐색·모바일 배치를 검증한다.
5. 공식 명칭 목록과 지표별 근거가 확보된 버전만 실제 공개 후보로 검토한다. Cloudflare 연결·배포와 push는 사용자 명시 요청에 따른다.

다음 구현 모델의 첫 범위는 1번이다. 이번 설계안 검토 후 실행 계획을 작성하고 모델 전환 시점을 알린다. 현재 문서는 구현 또는 배포 완료를 의미하지 않는다.
