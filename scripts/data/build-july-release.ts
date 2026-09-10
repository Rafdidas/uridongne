import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { parseMoisAdministrativeDongBytes } from "../../src/data/registry/mois-administrative-dong";
import { parseNormalizationContract } from "../../src/data/population/contract";
import { aggregateMonth } from "../../src/data/population/aggregate-month";
import { readPopulationRowsFromBytes } from "../../src/data/population/read-rows";
import { SnapshotRepository } from "../../src/data/publication/snapshot-repository";
import { readPopulation } from "../../src/data/publication/d1-population";
import type { D1Database } from "../../src/data/publication/d1-types";

const hash=(bytes: Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const quote=(value:unknown)=>value===null?"NULL":typeof value==="number"?String(value):`'${String(value).replaceAll("'","''")}'`;
async function main(){
  const raw=await readFile("data/raw/population/250_LOCAL_RESD_ADMDONG_202607.zip");
  const registryRaw=await readFile("data/raw/jscode20260701.zip");
  if(hash(registryRaw)!=="0b9f143fb6e43657ff72c863ac1412cc4be43e79dce323aac602fb7754663898") throw new Error("registry hash mismatch");
  const contract=parseNormalizationContract(JSON.parse(await readFile("data/source-contracts/population-202607.json","utf8")));
  if(hash(raw)!==contract.expectedSha256) throw new Error("source hash mismatch");
  const entry=new AdmZip(registryRaw).getEntries().find(e=>e.entryName.endsWith("KIKcd_H.20260701"));
  if(!entry) throw new Error("registry entry missing");
  const registry=parseMoisAdministrativeDongBytes(entry.getData(),"2026-07-01");
  contract.registry={version:"mois-20260701",evidenceIds:["mois-jscode-2026-07-01"],dongs:registry.map(({code,validFrom,validToExclusive})=>({code,validFrom,validToExclusive}))};
  const {expectedSha256,...input}=contract;
  const monthly=await aggregateMonth(readPopulationRowsFromBytes(raw,"250_LOCAL_RESD_ADMDONG_202607.zip"),input);
  if(monthly.status!=="complete" || registry.length!==427 || Object.keys(monthly.dongs).length!==427 || Object.values(monthly.dongs).some(d=>d.status!=="complete"||d.count!==744||d.missingSlots!==0)) throw new Error("July coverage incomplete");
  const db=new Database(":memory:");
  try {
    const store=new SnapshotRepository(db);store.migrate();db.exec(await readFile("migrations/0007_single_month_release.sql","utf8"));
    store.ingestPopulationVersion({id:"population-202607-month-only-v1",artifactId:"oa23016-202607",sourceSha256:expectedSha256,sourceByteLength:raw.length,contractHash:hash(JSON.stringify(contract)),processorVersion:"population-normalization-v2",outputHash:hash(JSON.stringify(monthly,(_k,v)=>typeof v==="bigint"?v.toString():v)),monthly});
    const snapshot="population-snapshot-202607-month-only-v1";
    const report={policy:"source-checked-month-only-v1",period:monthly.period,sourceSha256:expectedSha256,registrySha256:hash(registryRaw),dongs:427,slots:monthly.observedSlots,method:input.method,comparisonReleased:false};
    store.createSnapshot({id:snapshot,contentHash:hash(JSON.stringify(report)),publicationEligible:true});
    db.prepare("INSERT INTO snapshot_members VALUES (?, 'current', 'population-202607-month-only-v1', NULL)").run(snapshot);
    db.prepare("INSERT INTO single_month_releases VALUES (?, ?, '202607', 'source-checked-month-only-v1', 'docs/data/2026-09-10-july-release.md')").run(snapshot,expectedSha256);
    store.validateSnapshot(snapshot,hash(JSON.stringify(report)));
    const d1:D1Database={prepare(sql){let values:unknown[]=[];return {bind(...v:unknown[]){values=v;return this;},async first<T>(){return (db.prepare(sql).get(...values)??null) as T|null;},async all<T>(){return {success:true,meta:{},results:db.prepare(sql).all(...values) as T[]};}};},async batch(){return [];}};
    for(const dong of registry){const value=await readPopulation(d1,snapshot,dong.code);if(value?.status!=="available"||value.previousMean!==null)throw new Error("release read verification failed");}
    const tables=["source_artifacts","population_versions","population_monthly","snapshots","snapshot_members","single_month_releases"];
    const sql=tables.flatMap(table=>db.prepare(`SELECT * FROM ${table}`).all().map(value=>{const row=value as Record<string,unknown>;return `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(quote).join(",")});`;}));
    sql.push(`INSERT INTO snapshot_registry_members VALUES ('${snapshot}', 'mois-20260701');`);
    await writeFile("data/work/july-release-stage.sql",sql.join("\n"),{flag:"wx"});
    await writeFile("data/work/july-release-report.json",JSON.stringify(report,null,2),{flag:"wx"});
    console.log(JSON.stringify({...report,sample:await readPopulation(d1,snapshot,"11680640")}));
  } finally {db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
