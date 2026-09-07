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
