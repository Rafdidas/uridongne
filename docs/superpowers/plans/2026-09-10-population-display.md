# 생활인구 공개 조회 연결

사용자 승인: 2026-09-10 ‘진행’. 기존 정규화·스냅샷 설계를 재사용한다.

목표: 한 번 고정한 공개 snapshot의 current/previous_month를 읽어 상세 API와 화면에 제공한다.

- [x] D1 조회: validated/eligible snapshot, ready 월 버전만 읽는다. 입력 계약·공식 registry 유효기간·방법 일치·완결 슬롯을 검증한다.
- [x] 전월 비교: 전월 달력 일치, 원본 정수 합계로 평균·차이·비율 계산. 이전 0은 비율 null.
- [x] 상세 API/서버 컴포넌트 연결. 미검증 값은 null, 출처와 내국인/시간대 평균 정의 표시.
- [x] SQLite 기반 조회 테스트, 화면 테스트, lint/typecheck.
- [ ] 공식 근거와 실제 산출물 확인. 검증 불충분하면 공개 포인터를 이동하지 않고 부족한 근거를 인계한다.

원본 계약은 method=unverified, registry=null이다. 7월 registry를 6월까지 소급하지 않는다. 문서에서 검증된 것처럼 표현하지 않는다.
