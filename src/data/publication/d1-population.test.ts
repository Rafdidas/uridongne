import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { SnapshotRepository } from "./snapshot-repository";
import type { D1Database } from "./d1-types";
import { readPopulation } from "./d1-population";

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function fixture() {
  const db = new Database(":memory:"); databases.push(db);
  new SnapshotRepository(db).migrate();
  db.exec(readFileSync("migrations/0007_single_month_release.sql","utf8"));
  db.exec(`INSERT INTO snapshots VALUES ('s', 'validated', '${"a".repeat(64)}', '${"b".repeat(64)}', 1)`);
  for (const [role, period, count, mean] of [["current", "202607", 744, 150], ["previous_month", "202606", 720, 100]] as const) {
    const input = { period, asOfDate: "2026-09-10", sourceId: "OA-23016", schemaVersion: "oa23016-hourly-v1", method: {status:"verified", version:"fixture", evidenceIds:["fixture"]}, registry:{version:"fixture",evidenceIds:["fixture"],dongs:[{code:"11680640", validFrom:"2026-06-01",validToExclusive:null}]} };
    db.prepare("INSERT INTO source_artifacts VALUES (?, 'OA-23016', ?, ?, 100)").run(role, period, (role === "current" ? "c" : "d").repeat(64));
    db.prepare("INSERT INTO population_versions (id,artifact_id,contract_hash,processor_version,output_hash,input_json,state,coverage_status,monthly_status) VALUES (?, ?, ?, 'v1', ?, ?, 'ready', 'expected_registry', 'complete')").run(role, role, "e".repeat(64), "f".repeat(64), JSON.stringify(input));
    db.prepare("INSERT INTO snapshot_members VALUES ('s', ?, ?, NULL)").run(role,role);
    db.prepare("INSERT INTO population_monthly VALUES (?, '11680640', ?, ?, 0, ?, ?, ?, ?, 'complete')").run(role,count,count,period+"01",period+(period==="202607"?"31":"30"),String(BigInt(mean)*1000000n*BigInt(count)),mean+".000000");
  }
  const d1: D1Database = { prepare(sql) { let values: unknown[]=[]; return {bind(...v:unknown[]){values=v;return this;},async first<T>(){return (db.prepare(sql).get(...values)??null) as T|null;}, async all<T>(){return {results:db.prepare(sql).all(...values) as T[],success:true,meta:{}};}};},async batch(){return [];} };
  return {db,d1};
}
it("reads only the captured snapshot and compares unrounded monthly sums", async () => {
  const {d1}=fixture();
  expect(await readPopulation(d1,"s","11680640")).toMatchObject({status:"available",currentMean:"150.000000",previousMean:"100.000000",difference:"50.000000",percentChange:"50.000000",comparisonMode:"previous_month"});
  expect(await readPopulation(d1,"other","11680640")).toBeNull();
});
it("hides current numbers with unverified methods",async()=>{
  const {db,d1}=fixture();
  const row=db.prepare("SELECT input_json FROM population_versions WHERE id='current'").get() as {input_json:string};
  const input=JSON.parse(row.input_json);input.method={status:"unverified",version:null,evidenceIds:[]};
  db.prepare("UPDATE population_versions SET input_json=? WHERE id='current'").run(JSON.stringify(input));
  expect(await readPopulation(d1,"s","11680640")).toMatchObject({status:"unavailable",currentMean:null,previousMean:null,reasonCodes:["method_unverified"]});
});
it("does not apply July registry to June or publish loading versions",async()=>{
  const {db,d1}=fixture();
  const row=db.prepare("SELECT input_json FROM population_versions WHERE id='previous_month'").get() as {input_json:string};
  const input=JSON.parse(row.input_json);input.registry.dongs[0].validFrom="2026-07-01";
  db.prepare("UPDATE population_versions SET input_json=? WHERE id='previous_month'").run(JSON.stringify(input));
  expect(await readPopulation(d1,"s","11680640")).toMatchObject({currentMean:"150.000000",previousMean:null,reasonCodes:["administrative_area_unverified"]});
  db.exec("UPDATE population_versions SET state='loading' WHERE id='current'");
  expect(await readPopulation(d1,"s","11680640")).toBeNull();
});
it("keeps a zero previous value but omits the undefined percent",async()=>{
  const {db,d1}=fixture();db.exec("UPDATE population_monthly SET sum_micros='0',mean='0.000000' WHERE version_id='previous_month'");
  expect(await readPopulation(d1,"s","11680640")).toMatchObject({previousMean:"0.000000",difference:"150.000000",percentChange:null,reasonCodes:["previous_value_zero"]});
});
it("rejects ineligible snapshots and incomplete months",async()=>{
  const {db,d1}=fixture();
  db.exec("UPDATE snapshots SET publication_eligible=0");
  expect(await readPopulation(d1,"s","11680640")).toBeNull();
  db.exec("UPDATE snapshots SET publication_eligible=1; UPDATE population_monthly SET missing_count=1 WHERE version_id='current'");
  expect(await readPopulation(d1,"s","11680640")).toMatchObject({status:"unavailable",currentMean:null});
});
it("releases an explicitly approved single month without promoting method or exposing comparisons", async()=>{
  const {db,d1}=fixture();
  const row=db.prepare("SELECT input_json FROM population_versions WHERE id='current'").get() as {input_json:string};
  const input=JSON.parse(row.input_json);input.method={status:"unverified",version:null,evidenceIds:[]};
  db.prepare("UPDATE population_versions SET input_json=? WHERE id='current'").run(JSON.stringify(input));
  db.prepare("INSERT INTO single_month_releases VALUES ('s',?,'202607','source-checked-month-only-v1','evidence')").run("c".repeat(64));
  expect(await readPopulation(d1,"s","11680640")).toMatchObject({status:"available",currentMean:"150.000000",comparisonMode:"unavailable",previousMean:null,percentChange:null,reasonCodes:["comparison_not_released"]});
  db.exec("UPDATE single_month_releases SET period='202606'");
  expect(await readPopulation(d1,"s","11680640")).toMatchObject({status:"unavailable",currentMean:null});
});
