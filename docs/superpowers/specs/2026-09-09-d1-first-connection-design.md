# 첫 D1 연결 및 행정동 검색 설계

2026-09-09. 사용자 ‘진행’ 요청에 따른 기존 설계 검토 결과. 구현용 모델 전환 전 검토 문서이며 코드·D1 리소스는 아직 변경하지 않았다.

## 목표와 구현 경계

배포된 준비 화면에서 서울 행정동을 검색하고 선택하여 이름·자치구·목록 기준일과 지표 준비 상태를 확인하게 한다. 첫 실행 단위는 D1 연결과 비동기 조회 기반 검증으로 제한한다. 이후 공식 목록 공개, 검색·상세 화면을 순서대로 연결한다.

기존 공개 스냅샷 정책은 유지한다. 2026-07-01 목록은 해당 기준일의 목록으로 표시하며 현재까지 변경이 없다고 주장하지 않는다. 2025-07·2026-06에 소급 적용하지 않는다. 생활인구·점포 수치, 차트, 지도, R2 수집은 이번 첫 연결 범위 밖이다.

## 실제 코드와 차이

- `wrangler.jsonc`에는 D1 binding이 없다. 로컬 name은 `uridongne-mvp`이나 확인된 공개 주소는 `uridongne.rafdi.workers.dev`다. 실제 Worker 이름과 연결 저장소 설정을 읽어 확인한 뒤 기존 Worker를 대상으로 연결한다. URL만으로 설정 이름을 바꾸지 않는다.
- `SnapshotRepository`는 동기 `get/all/run`, SQLite transaction callback을 요구한다. D1의 비동기 prepared statement 및 batch와 직접 호환되지 않는다.
- `populationOverviewResponse`는 채널을 여러 번 조회하는 동기 인터페이스다. 운영 요청에서는 공개 포인터를 한 번 읽어 응답 내 버전 혼합을 막아야 한다.
- `hasPublishedSnapshot`은 population 구성원을 요구한다. 목록만 공개하는 경우를 현재 구현이 지원한다고 가정하지 않는다.
- 기존 registry importer는 `better-sqlite3`와 파일·ZIP을 사용하는 로컬 CLI다. Workers 요청 경로에 가져오지 않는다.

## 접근 선택

1. 기존 저장소 전체를 D1로 이식: 적재·공개·조회 변경이 한 번에 커진다.
2. 서버 전용 D1 조회 계층을 추가하고 로컬 적재 도구를 유지: 첫 연결을 독립 검증할 수 있어 선택한다.
3. 원본 JSON을 브라우저에 직접 제공: 버전 고정과 공개 검증을 별도 구현해야 하므로 선택하지 않는다.

기존 SQL migrations를 권위 있는 운영 스키마로 사용한다. 첫 연결에서 Drizzle 도입까지 묶지 않는다. 기존 D1 + Drizzle 방향을 폐기하는 결정은 아니며 ORM 전환은 별도 단위다.

## 첫 구현 단위: 연결 검증

- 예상 변경: `wrangler.jsonc`, `next.config.ts`, `package.json`, 생성 binding 타입, `src/data/publication/d1-context.ts`, `src/data/publication/d1-read-store.ts` 및 해당 테스트.
- 서버 요청 안에서 OpenNext `getCloudflareContext`로 `DB` binding을 얻는다. 클라이언트 컴포넌트·모듈 최상위·정적 빌드에서 DB 조회를 실행하지 않는다.
- 로컬 D1에 0001~0006 migration을 적용하고 테이블·외래키·준비된 쿼리 실행을 검증한다. 런타임 요청에서 migration을 실행하지 않는다.
- binding 부재와 아직 공개 채널이 없는 상태를 구분한다. 사용자 응답에는 내부 SQL·DB ID·오류 stack을 포함하지 않는다.
- 원격 리소스 생성 전 계정·Worker·기존 D1 목록을 확인한다. 전용 DB가 있으면 재사용하고 없으면 `uridongne-db`를 생성하는 방향이다. 실제 ID만 설정에 기록하며 토큰은 기록하지 않는다.
- 원격 migration은 지정한 DB의 기존 적용 이력을 확인한 후 적용한다. 기존 데이터 삭제·재생성은 이 범위에 없다. GitHub push는 별도 명시 요청 조건을 유지한다.

## 후속 단위: 목록만 포함하는 공개 스냅샷

- 기존 snapshots, snapshot_registry_members, public_channels, publication_events를 재사용한다. 공개 목록을 우회 제공하는 별도 최신 registry 조회는 만들지 않는다.
- 목록 공개 검증기를 추가한다. 공식 출처 URL과 보존 원본 SHA-256, 기준일, 코드 유일성, 이름·자치구, 유효기간, 행 수 및 정렬된 콘텐츠 해시를 검사한다. 단순히 ready 또는 publicationEligible=true를 받는 것으로 검증을 대체하지 않는다.
- 검증된 registry만 가진 snapshot을 지원하도록 공개 존재 판단을 population 구성과 분리한다. 검증 보고에 목록 전용임을 기록한다. 지표 구성원이 없으면 준비 중이며 내부 월별 수치를 조회하거나 반환하지 않는다.
- 모든 조회는 `snapshotId`, `generation`, `registryVersionId`, 목록 기준일을 한 번 확정한 뒤 고정 ID로 실행한다. 현재 스키마에 기준일 저장이 부족하면 신규 migration으로 명시적으로 보존한다.
- 공개 포인터 교체와 감사 이벤트는 같은 D1 batch의 조건부 SQL로 처리한다. 세대 경합·중복 operation·실패 시 rollback을 로컬 D1에서 먼저 검증한다.
- 원본 `data/raw/jscode20260701.zip`이 보존 근거의 해시와 일치하는지 먼저 확인한다. 기대 행 수는 검증 결과로 기록하며 생활인구 관측 동 수를 목록 행 수로 대신하지 않는다.

## 조회와 화면 계약

- 검색: `GET /api/dongs?q=...`. 앞뒤 공백 제거, 1~50자, 잘못된 입력 400. 준비된 SQL로 이름·자치구를 검색하고 SQL LIKE 와일드카드는 문자로 이스케이프한다. 결과는 자치구·이름·코드 순으로 최대 20개, 추가 결과 존재 여부를 함께 반환한다.
- 상세: `GET /api/dongs/[dongCode]`. 8자리 숫자가 아니면 400, 공개 스냅샷 없음 503, 해당 공개 목록에 없는 코드 404. 알려진 동의 지표 부재는 200이며 값은 null, 사유는 `population_not_available`이다.
- 두 응답 모두 snapshotId와 목록 기준일을 포함한다. 최초에는 응답 캐시를 끄고 이후 스냅샷 기반 캐시를 별도로 도입한다.
- `/`에 검색 입력·결과 링크, `/dongs/[dongCode]`에 동 이름·자치구·목록 기준일과 ‘생활인구 데이터를 준비하고 있습니다’를 표시한다. 초기 스타일 토큰을 사용하고 loading·빈 결과·오류·재시도 상태를 구분한다. 준비 중을 숫자 0으로 표시하지 않는다.

## 인수 조건 및 실행 순서

1. 모델 전환 후 연결 단위의 세부 실행 계획을 작성하고 D1 adapter를 구현한다.
2. 실제 로컬 D1 migration과 비동기 읽기 검증. 기존 SQLite 회귀 테스트만으로 D1 호환을 주장하지 않는다.
3. 목록 공개 검증과 검색/상세 API 테스트: 공개 없음, 잘못된 코드, 알 수 없는 코드, 알려진 동·지표 없음, 검색 와일드카드·상한, 읽는 도중 포인터 변경, fixture 공개 거부.
4. 검색·상세 화면을 구현하고 키보드 검색, 빈 결과, 오류 복구, 모바일 표시, 미검증 수치가 HTML/API에 없는지 브라우저에서 확인한다.
5. test/lint/typecheck/Next build 및 가능한 Linux OpenNext build 확인. Windows EPERM은 기존 제한으로 구분하여 기록한다.
6. 원격 DB 연결·적재·공개는 준비된 대상과 검증 결과를 확인한 후 수행한다. 배포 후 공개 주소에서 검색과 상세를 재검증하고 README와 handoff를 갱신한다.

설계 자체 검토: 기존 동기 API와 D1을 동일시하지 않음, 목록 공개와 지표 공개 분리, 공개 포인터 일관성, 기준일 비소급, 실제 Worker 이름 확인, 비밀값 제외를 확인했다. 이 문서 작성 중 테스트나 원격 리소스 생성은 실행하지 않았다.

## 확인 자료

- https://opennext.js.org/cloudflare/bindings
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- `docs/superpowers/specs/2026-09-08-d1-publication-detail.md`
- `docs/references/mois-administrative-dong-20260701.md`
