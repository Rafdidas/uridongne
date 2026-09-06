export const POPULATION_HEADERS = [
  "일자",
  "시간",
  "행정동코드",
  "생활인구합계",
  "남자 0~9세",
  "남자 10~14세",
  "남자 15~19세",
  "남자 20~24세",
  "남자 25~29세",
  "남자 30~34세",
  "남자 35~39세",
  "남자 40~44세",
  "남자 45~49세",
  "남자 50~54세",
  "남자 55~59세",
  "남자 60~64세",
  "남자 65~69세",
  "남자 70세 이상",
  "여자 0~9세",
  "여자 10~14세",
  "여자 15~19세",
  "여자 20~24세",
  "여자 25~29세",
  "여자 30~34세",
  "여자 35~39세",
  "여자 40~44세",
  "여자 45~49세",
  "여자 50~54세",
  "여자 55~59세",
  "여자 60~64세",
  "여자 65~69세",
  "여자 70세 이상",
] as const;

export function daysInMonth(period: string): number {
  if (!/^\d{6}$/.test(period)) throw new Error(`invalid period: ${period}`);
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4));
  if (month < 1 || month > 12) throw new Error(`invalid period: ${period}`);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
