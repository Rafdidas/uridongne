# 7월 단일 월 공개

사용자가 7월 월평균 우선 공개 제안에 ‘진행’으로 승인했다. 정책 `source-checked-month-only-v1`은 공식 원본 SHA-256, 정상 정규화, 공식 7월 행정동 및 744개 시간대 완결성을 공개 조건으로 삼는다. 방법의 기간 간 동등성은 확인 완료로 바꾸지 않는다.

- 원본 SHA-256: `738e30e09a9fb1420f66d28e2cddb2b37df238e7c376cff9c6fb2e63b12cd4b2`
- registry: `mois-20260701`, 427개 동, 317688개 슬롯, 누락 0
- method: `unverified` 유지; 비교 수치 전부 null
- 지표: 내국인 생활인구 시간대 추정치의 7월 산술평균. 월 방문자 수가 아님.
- SQL 생성·전 동 조회 검증: `node node_modules/tsx/dist/cli.mjs scripts/data/build-july-release.ts`
- 산출물: `data/work/july-release-stage.sql`, `july-release-report.json`. 재실행은 기존 파일을 덮어쓰지 않고 실패한다.
- migration 0007과 stage SQL은 D1에 적용 완료. 공개 포인터 전환 및 코드 배포 검증은 이후 인계 기록을 따른다.

이번 승인으로 기존 ‘방법 미확인 시 단일 월 값도 숨김’ 정책을 명시적으로 변경했다. 비교 검증 정책은 유지한다. `single_month_releases`는 스냅샷·기간·원본 해시에 묶여 있어 다른 파일에 승인 범위가 확장되지 않는다.
