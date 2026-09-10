import { parseMonthInput, POPULATION_SCHEMA_VERSION } from "../population/contract";
import { formatMean } from "../population/decimal";
import type { D1Database } from "./d1-types";
import type { PublicPopulation } from "./public-population";

interface MonthRow {
  role: string; period: string; inputJson: string; status: string;
  count: number; expected: number; missing: number; sum: string;
  firstDate: string; lastDate: string;
  singleMonth: number;
}
function dates(period: string) {
  if (!/^[1-9]\d{3}(0[1-9]|1[0-2])$/.test(period)) throw new Error("invalid stored period");
  const year=Number(period.slice(0,4)), month=Number(period.slice(4));
  const days=new Date(Date.UTC(year,month,0)).getUTCDate();
  const previous=new Date(Date.UTC(year,month-2,1));
  return {start:`${period.slice(0,4)}-${period.slice(4)}-01`,end:`${period.slice(0,4)}-${period.slice(4)}-${days}`,slots:days*24,previous:`${previous.getUTCFullYear()}${String(previous.getUTCMonth()+1).padStart(2,"0")}`};
}
function validate(row: MonthRow, code: string): string | null {
  const input=parseMonthInput(JSON.parse(row.inputJson));
  const range=dates(row.period);
  if(input.period!==row.period || input.schemaVersion!==POPULATION_SCHEMA_VERSION) return "schema_mismatch";
  if(input.method.status!=="verified" && row.singleMonth!==1) return "method_unverified";
  const area=input.registry?.dongs.find(dong=>dong.code===code);
  if(!area || area.validFrom>range.start || area.validToExclusive!==null && area.validToExclusive<=range.end) return "administrative_area_unverified";
  if(row.status!=="complete" || row.count!==range.slots || row.expected!==range.slots || row.missing!==0 || row.firstDate!==range.start.replaceAll("-","") || row.lastDate!==range.end.replaceAll("-","") || !/^\d+$/.test(row.sum)) return "incomplete";
  return null;
}
function rational(numerator: bigint, denominator: bigint) {
  const negative=numerator<0n;
  const scaled=(negative ? -numerator:numerator)*1000000n;
  const rounded=scaled/denominator+(scaled%denominator*2n>=denominator?1n:0n);
  return `${negative && rounded!==0n?"-":""}${rounded/1000000n}.${String(rounded%1000000n).padStart(6,"0")}`;
}

/** The caller captures snapshotId once; this query never reads the mutable public channel. */
export async function readPopulation(database:D1Database,snapshotId:string,dongCode:string):Promise<PublicPopulation|null> {
  const {results}=await database.prepare(`
    SELECT m.role, a.period, v.input_json AS inputJson, p.status,
      p.observed_count AS count, p.expected_count AS expected, p.missing_count AS missing,
      p.sum_micros AS sum, p.first_date AS firstDate, p.last_date AS lastDate,
      CASE WHEN r.snapshot_id IS NOT NULL THEN 1 ELSE 0 END AS singleMonth
    FROM snapshot_members m
    JOIN snapshots s ON s.id=m.snapshot_id AND s.state='validated' AND s.publication_eligible=1
    JOIN population_versions v ON v.id=m.population_version_id AND v.state='ready'
    JOIN source_artifacts a ON a.id=v.artifact_id AND a.source_id='OA-23016'
    LEFT JOIN single_month_releases r ON r.snapshot_id=s.id AND r.source_sha256=a.sha256
      AND r.period=a.period AND r.policy='source-checked-month-only-v1' AND m.role='current'
    JOIN population_monthly p ON p.version_id=v.id AND p.dong_code=?
    WHERE m.snapshot_id=? AND m.role IN ('current','previous_month')
  `).bind(dongCode,snapshotId).all<MonthRow>();
  const current=results.find(row=>row.role==="current");
  if(!current) return null;
  const output:PublicPopulation={status:"unavailable",snapshotId,currentPeriod:current.period,currentMean:null,comparisonMode:"unavailable",comparisonPeriod:null,previousMean:null,difference:null,percentChange:null,reasonCodes:[],candidateFailures:[]};
  try {
    const reason=validate(current,dongCode);
    if(reason){output.reasonCodes=[reason];return output;}
    output.status="available";output.currentMean=formatMean(BigInt(current.sum),current.count);
    if(current.singleMonth===1){output.reasonCodes=["comparison_not_released"];return output;}
    const previous=results.find(row=>row.role==="previous_month");
    let failure=previous?validate(previous,dongCode):"previous_month_unavailable";
    if(previous && !failure && previous.period!==dates(current.period).previous) failure="comparison_period_mismatch";
    if(previous && !failure) {
      const now=parseMonthInput(JSON.parse(current.inputJson)),before=parseMonthInput(JSON.parse(previous.inputJson));
      if(now.method.version!==before.method.version) failure="method_mismatch";
      // A changed registry needs a separately reviewed boundary mapping before comparison.
      if(now.registry?.version!==before.registry?.version) failure="administrative_area_unverified";
    }
    if(!previous || failure){output.reasonCodes=[failure??"previous_month_unavailable"];return output;}
    const numerator=BigInt(current.sum)*BigInt(previous.count)-BigInt(previous.sum)*BigInt(current.count);
    output.comparisonMode="previous_month";output.comparisonPeriod=previous.period;
    output.previousMean=formatMean(BigInt(previous.sum),previous.count);
    output.difference=rational(numerator,BigInt(current.count)*BigInt(previous.count)*1000000n);
    output.percentChange=BigInt(previous.sum)===0n?null:rational(numerator*100n,BigInt(previous.sum)*BigInt(current.count));
    if(output.percentChange===null) output.reasonCodes=["previous_value_zero"];
    return output;
  } catch {
    // Corrupt stored contracts must never make unvalidated numeric values public.
    return {...output,status:"unavailable",currentMean:null,comparisonMode:"unavailable",comparisonPeriod:null,previousMean:null,difference:null,percentChange:null,reasonCodes:["invalid_source"]};
  }
}
