# 2026-09-10 공식 생활인구 근거 추가 확인

## 확보한 원본

- `seoul-250m-manual-202505.pdf`: 서울 250M 격자 생활인구추계 매뉴얼, 표지 2025.5. SHA-256 `40aa05083957e013096490da18ab977ea3115105a3415ad4e14c0ac028ba3b65`.
- `seoul-250m-definition.xlsx`: 공식 정의서. SHA-256 `18238af79d3af821d4b2b029d7512385286a3a0e9ae76113f0fbef8f744bf93a`.
- 원문 페이지: https://data.seoul.go.kr/dataVisual/seoul/seoulLivingPopulation.do
- 실제 내려받기는 `https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false`에 POST. 매뉴얼은 `infId=DOWNLOAD&infSeq=4&seq=35&seqNo=`, 정의서는 seq=34. 일반 링크 추출에 나타난 PNG는 문서가 아니다.

매뉴얼 11~14쪽에서 LTE/5G 로그 처리, 전수화, 시간대별 격자 산출, 행정동 매핑을 확인했다. 정의서 SPOP_T1은 33개 필드(격자 포함)이며 행정동 집계 원본은 격자 열을 제외한 32개다. 이 문서는 일반적인 산출 방식을 설명하지만 2026년 6월·7월의 개별 파일에 적용한 버전 이력을 명시하지 않는다.

## 행정동 원본 대조

- 2026.3.25 시행 공지: https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=124721
- 첨부: https://www.mois.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_00143539RhJP6z3&fileSn=1
- `data/raw/jscode20260325.zip` SHA-256 `880f984654e424577050535bc67935088ec9ad957e3de637f332186d35fb7c24`.
- 기존 2026.7.1 시행 원본과 KIKcd_H 파일의 서울 행 453개(상위 기관 포함)가 정확히 같았다. 이는 코드·이름·생성/말소일 목록 일치이며, 모든 경계 폴리곤의 동일성을 입증하는 것은 아니다.
- 7.1 공지는 전남광주·인천·안양 변경이며 서울 변경을 열거하지 않는다.
- 7.20 공지: https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=127979 — 변경 대상은 세종 집현동 신설이다.

## 남은 결정적 근거

공식 다운로드 매뉴얼을 확보했으므로 ‘방법 문서 없음’은 해소했다. 다만 기존 공개 계약이 요구하는 기간별 동일 산출 방식 및 코드 유지 상태의 경계 변경 확인은 아직 완료하지 못했다. 계약을 verified로 변경하거나 실제 숫자를 발행하지 않았다.

제공기관 확인용 질문 초안(미전송):

> OA-23016의 250_LOCAL_RESD_ADMDONG_202606.zip 및 202607.zip은 현재 제공 중인 2025년 5월 250M 격자 생활인구추계 매뉴얼과 동일한 추계/전수화 방식으로 생성된 자료인가요? 두 기간 사이 산출 방식 변경 또는 행정동 경계·격자 매핑 변경이 있는지, 적용일과 관련 자료를 안내 부탁드립니다.
