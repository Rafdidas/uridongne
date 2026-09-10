# 생활인구 공개 준비 점검

후속 확인: [공식 매뉴얼·행정동 원본 대조](../references/population-evidence-20260910.md). 매뉴얼 및 3월 목록을 확보했다. 아래의 ‘매뉴얼 본문 미확보’는 최초 점검 시점의 기록이며, 남은 사항은 기간별 추계 방식/격자 매핑의 적용 이력이다.

2026-09-10 확인. 사용자 승인 범위: 2026년 6월·7월 내국인 월평균 및 전월 증감.

## 실제 산출물

`readMonthlyOutput`으로 기존 `data/work/population-YYYYMM-task5-v2-a`의 완료 봉투·manifest·본문·실행 계약 해시를 다시 검증했다.

| 기간 | 상태 | 관측 동 | 슬롯 | 방법 | registry |
| --- | --- | --- | --- | --- | --- |
| 202606 | complete | 427 | 307440 | unverified | null |
| 202607 | complete | 427 | 317688 | unverified | null |

완결 슬롯은 산출 방법·행정동 경계의 검증을 의미하지 않는다.

## 공식 자료 확인

- https://data.seoul.go.kr/dataList/OA-23016/S/1/datasetView.do : 내국인·250m 격자 기반 행정동 생활인구, 202606/202607 파일을 확인했다.
- https://data.seoul.go.kr/dataVisual/seoul/seoulLivingPopulation.do : 특정 지역·시점의 추정 인구, 24시각 평균 정의와 행정동 8자리 코드 설명을 확인했다.
- 해당 페이지와 검색 결과만으로 두 월의 동일 산출 버전 및 6월까지 유효한 공식 경계 이력을 확정하지 못했다. 다운로드 아이콘 링크는 이미지로 연결돼 문서 본문 근거로 삼지 않았다.

## 구현·제한

D1 reader는 호출자가 고정한 snapshotId만 사용한다. validated/eligible snapshot의 ready current/previous_month를 읽고, 입력 계약·방법·동 코드 유효기간·월 슬롯을 확인한다. 같은 registry 버전과 방법에서만 전월 비교한다. 원본 정수 합계로 증감을 계산하며 이전 0은 비율만 null이다. API와 상세 페이지가 같은 reader를 쓴다.

이번 구현은 공개 조회 경로다. 실제 생활인구 D1 적재와 공개 snapshot 생성은 완료하지 않았다. 기존 공개 포인터는 변경하지 않았다. 다른 registry 버전 사이의 비교는 별도의 경계 검토가 필요하다.

다음 단계: 6월·7월에 적용되는 공식 방법 및 행정동 근거 확보 → 계약 갱신·원본 재정규화 → D1 적재/스냅샷 발행 → 공개 브라우저 검증. 근거 없이 verified로 변경하지 않는다.

검증: 35개 파일 189개 테스트, lint, `node node_modules/typescript/bin/tsc --noEmit` 통과. production build 및 이번 패널 브라우저 검증은 미실행. pnpm exec의 tsx/tsc shim이 인식되지 않아 설치된 동일 패키지의 JS 진입점을 직접 실행했다.
