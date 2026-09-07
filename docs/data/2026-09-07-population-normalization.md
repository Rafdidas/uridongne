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

## 입력 계약 도입 후 재검증

세 source-contract에 asOfDate=2026-09-07, sourceId=OA-23016, schemaVersion=oa23016-hourly-v1, method={status:unverified,version:null,evidenceIds:[]}, registry=null을 명시했다. 원본 SHA-256은 그대로 유지했다.

새 실행 경로는 `data/work/population-YYYYMM-contract3`이다. 입력 계약·coverageStatus·최초/최종일·누락률이 추가되어 JSON 전체 해시는 이전 형식과 달라지지만, 모든 동의 관측 수·정수 합계·평균·결측 수·상태는 validation2와 일치한다. 위 표의 행 수와 동 수도 유지된다.

세 결과 모두 observed_only와 method unverified다. 공식 목록 및 산출 방식 자료를 이번 실행에서 새로 확인한 것은 아니다. 비교 결과는 `data/work/population-comparison-contract3`에 기록했고 사유별 425/2/1건과 CLI 종료 코드 2가 유지된다.

검증은 전체 99개 테스트와 lint·typecheck·Next build를 통과했다. 실제 프로세스 테스트로 잘못된 계약은 원본 읽기 전 코드 1, 원본 해시/관측 오류는 코드 2임을 확인했다.

## 오류 진단·청크 파싱 도입 후 재검증

`data/work/population-YYYYMM-stream4`에서 세 ZIP을 다시 처리했다. 202607/202507/202606의 슬롯 317,688/316,944/307,440개와 동 427/426/427개가 유지됐고 각 dongs 객체는 contract3과 동일했다. 모든 월에서 diagnostics.counts={}, samples=[]였다.

비교 산출물은 `data/work/population-comparison-stream4`에 생성했고 전체 unavailable에 맞춰 CLI 코드 2를 반환했다. 이후 구현 모델에서 외부 `MonthResult` JSON 경계·실패 후보 읽기·내용 manifest와 실행 해시 분리를 추가했으며, 현재 로컬 검증은 테스트 121개·lint·typecheck를 통과했다. 실제 원본 재처리는 아직 다시 실행하지 않았다.

CSV 정보의 line은 레코드의 물리적 종료 행이다. 헤더와 데이터 구분자는 엔트리 메타데이터에 별도로 남긴다. ZIP 해제 전 선언 크기 검증과 해제 후 실제 크기 검증을 수행한다.

## Task 5 재현성·공식 근거 확인 (2026-09-07)

세 실원본을 각각 새 `data/work/population-YYYYMM-task5-a`와 `...-task5-b` 경로에 두 번 처리했다. 동일 입력의 `monthly.json`·`manifest.json`은 모두 바이트 단위로 같았고, 실행 시각·경과시간·RSS가 들어간 `run.json`만 실행별로 달라질 수 있다.

## 새 형식 인수 검증 (2026-09-08)

`formatVersion=2`와 `--work-root data/work`를 적용해 기존 raw ZIP과 계약을 다음 새 경로에서 각각 두 번 재처리했다. 기존 `task5-a/b` 결과는 덮어쓰지 않았다.

| 기간 | reader 상태 | 동 수 | 관측 슬롯 | 누락 슬롯 | 오류 counts | monthly SHA-256 (a=b) | manifest SHA-256 (a=b) |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| 202507 | complete | 426 | 316,944 | 0 | `{}` | `355228c90807b38887b5333b81da4734daa1131999ac807a15b3ed779e018d44` | `69fa3247ea567bf493afeb9880f7a3da0466d8e7f3294c81e56f53a23785a728` |
| 202606 | complete | 427 | 307,440 | 0 | `{}` | `19d525381d3cb8cdda49b1f67b73e10ec75897398a8301043e0d7568a75be2ff` | `0d0943a667d3fd0143ae99fd614b6f7872531b1ed9e0971e8433cba82a87ffe9` |
| 202607 | complete | 427 | 317,688 | 0 | `{}` | `e74c2caf4e56d2a49e0a90af303d2640fee2b9cd236a116618c0f966fc027e1` | `660a48a683aa079632750f4d3d064aba4cba6b26c0055267b0842801b7288f4b` |

각 a/b 산출물은 `readMonthlyOutput`으로 다시 읽어 검증했다. 비교 CLI도 `population-comparison-task5-v2-a/b`에서 실행했고 두 `comparison.json`은 SHA-256 `c2bfcaac2af717ee3f525f467f87c01d59a34638aecc341f52b9d552ef039664`, 두 manifest는 `6cd133586fcc71e8ba0b01390c318209f393e54c1ab195c2341f1d0ff493f82a`로 동일했다. 비교는 방법 근거가 `unverified`인 현재 계약을 보수적으로 반영해 동별 `unavailable`을 기록했으며, 사유 집계는 `method_unverified` 425건, `administrative_area_unverified` 2건, `current_incomplete` 1건이다. 비교 CLI의 전체 unavailable 종료 상태는 예상된 코드 2이며, 결과 파일은 정상적으로 생성되어 원천 손상과 구분된다.

세 기간의 새 monthly 본문 SHA-256은 기존 `task5-a` monthly SHA-256과도 각각 일치했다.

실행 메타데이터에는 처리별 `startedAt`, `finishedAt`, `elapsedMs`, `rssAtEndBytes`가 기록됐다. `data/raw/`와 `data/work/`는 `.gitignore`에 의해 제외됨을 `git check-ignore`로 확인했다. 공식 산출 방법·행정동 registry 근거는 확인하지 않았으므로 `method=unverified`, `registry=null`을 유지한다.

| 기간 | 상태 | 동 수 | 오류 counts | monthly/manifest 반복 일치 | source SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| 202507 | valid | 426 | `{}` | yes / yes | `30221cca72f9bcdc55386f0d117c6104e19d257fbed8a3f5760a31aadf0cb146` |
| 202606 | valid | 427 | `{}` | yes / yes | `de7948a1002cfa135c8bb66c4ee1ba1c45963ebfc97dd650a94e3cb7a660f872` |
| 202607 | valid | 427 | `{}` | yes / yes | `738e30e09a9fb1420f66d28e2cddb2b37df238e7c376cff9c6fb2e63b12cd4b2` |

서울 열린데이터광장의 [OA-23016 공식 페이지](https://data.seoul.go.kr/dataList/OA-23016/S/1/datasetView.do)를 2026-09-07 읽기 전용으로 확인했다. 페이지는 `[내국인] 행정동별 서울 생활인구(250m)` 데이터셋과 202507·202606·202607 파일 목록, 제공기관 서울특별시 및 일 1회 갱신 정보를 확인하게 해준다. 그러나 현재 원본의 산출 방법 버전·필드 버전과 행정동 코드 변경의 유효일·근거 이력을 함께 제공하지 않으므로, 동일 OA ID·헤더만으로 `method.verified` 또는 registry를 승인하지 않았다. 세 계약은 계속 `method.unverified`, `registry: null`, `coverageStatus: observed_only`로 둔다.

Task 5의 남은 의미적 확인은 공식 행정동 목록·변경 이력의 별도 근거가 확보될 때 수행한다. 현재 결과를 전년 비교의 공식 경계 변경 증거로 해석하지 않는다.
