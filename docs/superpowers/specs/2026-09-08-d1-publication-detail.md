# D1 저장·공개 포인터 상세 설계

2026-09-08, 기준 HEAD c67f103. 설계 단계이며 실행 SQL·앱 코드·외부 리소스를 생성하지 않았다. 기존 2026-09-07 D1 개요의 저장·공개 부분은 이 문서를 우선한다.

## 범위

다음 구현 단위는 로컬 저장소, 검증, 공개 포인터, 조회 repository까지다. 실제 공개·Cloudflare 연결·UI 구현은 후속 단계다. 실제 원본 재인수 성공은 정상 입력의 재현 근거이며 모든 거부 조건 완료를 뜻하지 않는다.

## 저장 계약

| 단위 | 키와 필수 참조 | 제약 |
| --- | --- | --- |
| source_artifacts | source_id + period + sha256 유일, byte_length | 같은 기간의 수정 원본은 별도 행 |
| population_versions | source_artifact_id + contract_hash + processor_version + output_hash 유일 | 검증된 MonthResult 전체 입력 보존, loading/ready/rejected 구분 |
| population_monthly | version_id + dong_code 기본키 | 카운트 INTEGER, 코드·합계·평균 TEXT. ready 버전 수정 금지 |
| population_failures | 실패 봉투 해시, 원본·계약·처리 버전·전체 invalid MonthResult | 실패를 정상 월 관측 행으로 변환하지 않음 |
| comparison_sets | 현재 월 버전, 전년·전월 후보 참조, 변경 근거 해시, policy_version, result_hash | 후보는 성공 버전 또는 실패 참조 중 정확히 하나. 현재 월은 성공 버전 필수 |
| population_comparisons | comparison_set_id + dong_code | 부모가 입력 참조를 소유. 계산 결과는 재계산 검증 후 고정 |
| registry_versions/entries | 명칭 목록 근거 버전, code + valid_from | 반개구간 유효기간, 같은 코드의 기간 중첩 거부 |
| evidence_documents | 공식 URL, 보존 문서 해시, 적용기간, 검토 상태 | 명칭·산출 방법·경계 호환 근거를 별도로 구분 |
| snapshots | id, state, content_hash, validation_report_hash, publication_eligible | building/validated/rejected. published 상태는 두지 않음 |
| snapshot_members | snapshot_id + 역할 | registry, current, previous_year, previous_month, comparison_set 참조를 고정 |
| public_channels | name 기본키, snapshot_id nullable, generation | 최초 null/0. 공개 사실의 유일한 기준 |
| publication_events | channel + generation 유일 | 이전/새 snapshot, operation_id 유일, 공개·복구 사유 기록 |
| ingestion_runs | 실행 ID, 입력·출력 참조, 실행 상태·측정치 | 콘텐츠 정체성과 실행 시간을 분리 |

SQL 외래키·CHECK와 런타임 검증을 함께 사용한다. 비교 후보의 다형 참조는 두 nullable FK와 XOR CHECK로 구현한다. 버전별 행 수·코드 집합·정렬된 콘텐츠 해시를 검증해야 ready가 된다. 재시도 중 같은 키의 값이 다르면 충돌로 실패하며 INSERT OR REPLACE로 덮지 않는다.

콘텐츠 해시는 버전 있는 정규 직렬화 규칙을 따른다. 객체 키 순서, 코드 정렬, null, 십진 문자열 표현을 고정하고 실행 시간·로컬 경로는 제외한다. 기존 manifest의 바이트 해시는 기존 규칙 그대로 별도로 보존한다.

## 적재·검증

1. 정규화 성공/실패 봉투를 검증하고 원본·계약·처리 참조를 반환하는 importer 입력 DTO를 만든다. 현재 readCandidateOutcome은 실패의 전체 입력 참조를 반환하지 않으므로 확장이 필요하다.
2. 월 버전은 loading으로 만들고 제한된 batch로 적재한다. 실패/중단 시 포인터를 건드리지 않는다. ready 이후 자식 변경은 DB 제약 또는 트리거로 차단한다.
3. 현재 comparison.json만 받아 공개하지 않는다. 현재 비교 manifest는 세 입력과 변경 근거를 충분히 묶지 않는다. importer가 검증된 월 DTO와 변경 근거로 compareMonths를 다시 실행하여 comparison_set을 만든다.
4. building snapshot에 ready 구성원을 연결한다. member 역할별 기간과 비교 부모 참조가 정확히 같은지 검사한다. 실패 후보에는 월 관측을 요구하지 않는다.
5. 구성 고정, 검증 보고 저장, validated 전환을 하나의 작은 트랜잭션으로 처리한다. 구성원 변경도 building 조건을 강제해 검증 중 변경 경합을 차단한다.

검증 보고는 데이터 무결성 통과 여부와 publication_eligible을 구분한다. 명칭 목록이 없는 실원본도 내부 validated까지 가능하지만 공개 포인터 대상으로는 부적격이다. fixture 근거는 로컬 개발 채널에만 허용하며 실제 채널에서는 거부한다.

## 공개·복구

채널 초기화는 null 포인터, generation 0으로 멱등 실행한다. 공개 명령은 operation_id, expected_generation, target_snapshot_id를 받는다.

조건부 UPDATE는 채널의 generation 일치와 대상의 validated·publication_eligible을 동시에 검사한다. 성공 시 generation을 1 증가시키고 publication_events를 같은 batch에 기록한다. UPDATE가 0행이어도 SQL 오류가 아니므로 이벤트 INSERT 또한 갱신 결과와 operation_id를 조건으로 제한해야 한다. 무조건 이벤트를 남기지 않는다. 구현 인수 테스트에서 이 원자성을 검증한다.

동일 operation_id 재요청은 기존 이벤트가 같은 요청인지 확인해 동일 결과를 반환한다. 다른 payload의 재사용은 충돌이다. 경합 패자는 최신 generation으로 자동 재시도하지 않는다. 복구도 이전의 적격 validated snapshot을 대상으로 같은 명령을 수행하며 generation은 감소하지 않는다. 실제 공개 여부를 snapshots 상태에 중복 저장하지 않아 다중 채널·복구 시 상태 충돌을 없앤다.

대량 적재 전체는 원자적이라고 가정하지 않는다. D1 batch 내 명령은 트랜잭션으로 실행되고 실패 시 묶음이 롤백되므로, 최종 포인터·감사 기록만 작은 batch에 묶는다. [D1 공식 API](https://developers.cloudflare.com/d1/worker-api/d1-database/)를 2026-09-08 확인했다. 이 포인터 정책은 프로젝트의 설계 결정이다.

## 조회·공개 정책

요청 시작에 snapshot_id와 generation을 한 번 얻고 모든 조회에 전달한다. 콘텐츠는 불변이며 응답·캐시 키에 snapshot_id를 포함한다. 최초 구현은 primary 읽기를 기준으로 검증하고, 읽기 복제를 활성화한다면 별도로 D1 세션 일관성을 검증한다.

명칭 목록이 검증된 snapshot은 일부 또는 모든 지표가 unavailable이어도 공개할 수 있다. 현재값의 공개에는 해당 동의 월 슬롯 완결과 산출 방법 근거가 필요하다. 비교에는 후보 완결·방법 호환과 기간 전체의 경계 호환 근거가 추가로 필요하다. 빈 changes 배열은 변경 없음의 공식 증거가 아니다. 명칭 확인만으로 경계가 같다고 판단하지 않는다.

현재 compareMonths는 unavailable 결과에도 currentMean을 포함할 수 있으므로 내부 계산 결과를 그대로 API로 반환하지 않는다. 공개 DTO 변환이 currentStatus와 comparisonStatus를 각각 판정하고 미검증 값은 null로 만든다. 근거 없는 수치가 HTML·API·캐시에 들어가지 않는 테스트가 필요하다.

검색·상세의 기존 400/404/503 계약은 유지한다. 검색도 공개 snapshot 없으면 503이다. 알려진 동의 지표 부재는 200/unavailable, 알 수 없는 동은 404로 구분한다. 불가 사유는 누락된 근거를 명시하며 0으로 바꾸지 않는다.

## 구현 전 잔여 사항과 순서

기존 재검토 중 아직 차이가 있는 항목: 엄격한 limit+1 읽기(현재는 한 chunk까지 초과 읽음), 역순·중복/누락 회귀 보강. 경로 검증은 현재 로컬 단일 사용자 작업 전제이며 검사 후 경로 변경까지 방어했다고 주장하지 않는다. 후보 기간 오류의 CLI 코드 1 분류, 실제 0/00 입력, 실패 DTO의 전체 입력 참조 보존은 2026-09-08 구현에서 완료했다.

이 잔여 사항은 로컬 D1 스키마 설계를 막지 않지만 운영 수집·공개 완료 조건에는 포함한다. 구현용 모델은 다음 순서로 진행한다.

1. 잔여 계약 테스트·오류 분류 및 importer DTO를 완성한다.
2. 로컬 마이그레이션과 저장 repository를 구현한다. 동일 콘텐츠 재시도, 값 충돌, 외래키, 정확한 큰 십진수, loading 실패 및 ready 불변성을 검증한다.
3. snapshot 구성 검증과 공개 명령을 구현한다. 최초 공개, 두 writer 경합, 이벤트 실패 시 롤백, 중복 operation, 복구를 실제 로컬 DB로 검증한다.
4. 고정 snapshot 조회·공개 DTO를 구현한다. 공개 중 교체에도 한 응답의 버전 혼합 금지, 미확인 값 차단, fixture 운영 공개 차단을 검증한다.
5. README의 로컬 DB 준비·검증 명령을 실제 구현에 맞춰 갱신한다. Cloudflare 계정 연결과 실제 공개는 사용자 요청 시 별도 진행한다.

실행 SQL과 상세 테스트 파일은 구현 단계에서 추가한다. 이 설계 검토에서 테스트·빌드·로컬 D1 실행은 수행하지 않았다.

## 구현 진행 기록

2026-09-08 구현용 모델에서 `migrations/0001_population_snapshots.sql`과 `SnapshotRepository`의 첫 단위를 추가했다. 로컬 SQLite로 snapshots, public_channels, publication_events를 실제 실행한다. validated와 publication_eligible을 모두 확인한 뒤 expected_generation 조건으로 포인터를 교체하며, 같은 operation_id는 같은 채널·세대·스냅샷·사유의 재시도만 허용한다. 스키마 SQL은 메모리 SQLite 실행으로 확인했고 repository는 최초 공개, stale writer, 공개 부적격, 멱등 재시도를 회귀 검증했다. population version·comparison set 적재와 조회 repository는 아직 구현하지 않았다.
