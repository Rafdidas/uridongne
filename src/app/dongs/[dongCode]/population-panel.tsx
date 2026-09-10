import type { PublicPopulation } from "@/data/publication/public-population";

function month(period: string) { return `${period.slice(0,4)}년 ${Number(period.slice(4))}월`; }
function number(value: string) {
  // Values are decimal strings; keep integer precision when adding grouping separators.
  const [whole,fraction=""]=value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,",")+(fraction.slice(0,2).replace(/0+$/,"")?`.${fraction.slice(0,2).replace(/0+$/,"")}`:"");
}
export function PopulationPanel({population}:{population:PublicPopulation|null}) {
  const available=population?.status==="available" && population.currentMean!==null;
  return <section className="glass-inset mt-8 rounded-2xl p-6" aria-labelledby="population-title">
    <h2 id="population-title" className="text-lg font-semibold">내국인 생활인구 · 시간대 평균</h2>
    {available ? <>
      <p className="mt-2">{month(population.currentPeriod)}</p>
      <p className="mt-2 text-3xl font-bold">{number(population.currentMean!)}명</p>
      {population.comparisonMode==="previous_month" && population.previousMean!==null && population.comparisonPeriod!==null ? <>
        <dl className="mt-5 grid grid-cols-1 gap-3">
          <div><dt>{month(population.comparisonPeriod)}</dt><dd>{number(population.previousMean)}명</dd></div>
          <div><dt>전월 대비</dt><dd>{population.difference===null?"비교 불가":`${population.difference.startsWith("-") || Number(population.difference)===0?"":"+"}${number(population.difference)}명`}
            {population.percentChange!==null ? ` (${Number(population.percentChange)>0?"+":""}${number(population.percentChange)}%)`:null}</dd></div>
        </dl>
        {population.reasonCodes.includes("previous_value_zero")?<p className="mt-3 text-sm">이전 값이 0명이어서 증감률을 계산할 수 없습니다.</p>:null}
      </>:<p className="mt-4">전월 증감은 비교 기준 확인 후 공개합니다.</p>}
    </>:<p className="mt-2 text-[var(--surface-higher)]">생활인구 데이터를 준비하고 있습니다. 원본과 행정구역 검증을 마친 뒤 공개합니다.</p>}
    <p className="mt-5 text-sm text-[var(--surface-higher)]">한 달의 모든 날짜·시간대별 내국인 추정 인구를 평균한 값입니다. 월간 방문자 수나 주민등록인구와 다릅니다.</p>
    <a className="mt-3 inline-block text-sm underline" href="https://data.seoul.go.kr/dataList/OA-23016/S/1/datasetView.do">출처: 서울 열린데이터광장 · 내국인 생활인구(250m)</a>
  </section>;
}
