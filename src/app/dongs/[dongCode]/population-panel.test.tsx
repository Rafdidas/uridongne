import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PopulationPanel } from "./population-panel";
import type { PublicPopulation } from "@/data/publication/public-population";
const population: PublicPopulation={status:"available",snapshotId:"s",currentPeriod:"202607",currentMean:"150.000000",comparisonMode:"previous_month",comparisonPeriod:"202606",previousMean:"100.000000",difference:"50.000000",percentChange:"50.000000",reasonCodes:[],candidateFailures:[]};
it("labels the metric and comparison months with the source",()=>{
  const html=renderToStaticMarkup(<PopulationPanel population={population}/>);
  expect(html).toContain("2026년 7월");expect(html).toContain("2026년 6월");
  expect(html).toContain("150");expect(html).toContain("+50");expect(html).toContain("내국인");expect(html).toContain("OA-23016");
});
it("does not display unavailable numbers and handles missing snapshots",()=>{
  expect(renderToStaticMarkup(<PopulationPanel population={null}/>)).toContain("생활인구 데이터를 준비하고 있습니다");
  const html=renderToStaticMarkup(<PopulationPanel population={{...population,status:"unavailable",currentMean:null,reasonCodes:["method_unverified"]}}/>);
  expect(html).not.toContain("150");expect(html).toContain("검증");
});
it("explains why a zero denominator has no percentage",()=>{
  const html=renderToStaticMarkup(<PopulationPanel population={{...population,previousMean:"0.000000",percentChange:null,reasonCodes:["previous_value_zero"]}}/>);
  expect(html).toContain("0명");expect(html).toContain("증감률을 계산할 수 없습니다");expect(html).not.toContain("null");
});
