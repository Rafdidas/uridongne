# 생활인구 월 정규화 실행 기록

2026-09-07 기준으로 OA-23016 원본 세 달을 새 정규화 파이프라인으로 읽었다.

| 기간 | 원본 | 상태 | 방법 근거 |
|---|---|---|---|
| 202607 | `250_LOCAL_RESD_ADMDONG_202607.zip` | complete | unverified |
| 202507 | `250_LOCAL_RESD_ADMDONG_202507.zip` | complete | unverified |
| 202606 | `250_LOCAL_RESD_ADMDONG_202606.zip` | complete | unverified |

세 원본은 계약된 SHA-256과 일치했고, EUC-KR·32개 헤더를 사용한다. ZIP 엔트리는 순차적으로 해제했으며, 따옴표로 감싼 쉼표 행과 헤더/데이터 구분자가 다른 엔트리를 함께 처리했다.

산출물은 로컬 `data/work/` 아래에 생성했다. `complete.json`과 매니페스트 해시가 있는 디렉터리만 소비 대상으로 삼는다. 비교 실행은 방법 근거가 `unverified`인 상태를 보수적으로 반영해 각 동을 `unavailable`로 기록했다. 이는 전년·전월 평균을 임의로 공개하지 않기 위한 의도된 결과다.

재현 명령:

```text
pnpm data:normalize-population -- --input data/raw/population/250_LOCAL_RESD_ADMDONG_202607.zip --contract data/source-contracts/population-202607.json --output-dir data/work/population-202607-run1
pnpm data:compare-population -- --current-dir data/work/population-202607-run1 --previous-year-dir data/work/population-202507-run1 --previous-month-dir data/work/population-202606-run1 --changes data/source-contracts/population-area-changes.json --output-dir data/work/population-comparison-run1
```

원본 ZIP은 저장소에 추가하지 않으며, 실행 디렉터리도 로컬 작업 산출물로 유지한다.

## 오류 보완 후 재검증

위의 complete는 관측된 동의 슬롯 완결성을 뜻한다. 공식 서울 전체 코드 목록이나 산출 방식 검증 완료가 아니다. 앞선 방법 미확인 일괄 설명은 아래 실측 사유로 정정한다.

| 기간 | 고유 슬롯 | 관측 동 | 미완결 동 | 관측 오류 |
| --- | ---: | ---: | ---: | ---: |
| 202607 | 317,688 | 427 | 0 | 0 |
| 202507 | 316,944 | 426 | 0 | 0 |
| 202606 | 307,440 | 427 | 0 | 0 |

새 경로 `data/work/population-YYYYMM-validation2`의 monthly.json은 각 run1과 바이트 단위로 일치했다.

| 기간 | monthly.json SHA-256 |
| --- | --- |
| 202607 | ede4f6f10b7881f8f4505e9e24151474fbfbac0d830f3c15f4c007ceb9b1cdac |
| 202507 | ea85378ba4e96c18a4173ad147dd5e97b546c925eab1110b60b121f85ef5569f |
| 202606 | 39ac3ddae32a33ccbd3e3f57bb0fabb1f093cdd8275dc30659e32d2b6f762f26 |

비교 합집합 428개 코드의 결과: method_unverified 425개, administrative_area_unverified 2개, current_incomplete 1개. 전년 대비 현재 전용 코드는 11230515·11230533이고 전년 전용 코드는 11230536이다. 현재와 전월 코드 목록은 동일하다. 코드 차이만으로 공식 경계 변경을 확정하지 않는다.

비교 산출물은 `data/work/population-comparison-validation2`에 기록됐으며 전체 unavailable에 맞춰 CLI는 종료 코드 2를 반환했다. 오류 보완 후 전체 테스트 55개와 lint·typecheck·Next build가 통과했다. 상세 계약·공식 근거·메모리 측정 등 남은 설계 항목은 handoff의 최신 이력을 따른다.
