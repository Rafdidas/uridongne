# 행정안전부 행정동 코드 원본

- 기준일: 2026-07-01
- 원본: 행정안전부 「행정기관(행정동) 및 관할구역(법정동) 변경내역(2026.7.1. 시행)」의 `jscode20260701.zip`
- 출처: https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=127039
- 내려받기 URL: https://www.mois.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_00146280tlU2Y2B&fileSn=0
- SHA-256: `0b9f143fb6e43657ff72c863ac1412cc4be43e79dce323aac602fb7754663898`
- 사용 파일: `jscode20260701/KIKcd_H.20260701` (행정기관코드/행정동)

원본 ZIP은 대용량 원본 보관 규칙에 따라 Git에서 제외된 `data/raw/jscode20260701.zip`에 둔다. 적재기는 서울특별시의 활성 행정동만 읽고, 10자리 코드 끝의 `00`을 제외한 8자리를 생활인구 코드로 사용한다.
