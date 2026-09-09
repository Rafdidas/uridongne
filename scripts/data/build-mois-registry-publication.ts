import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import AdmZip from "adm-zip";

import { parseMoisAdministrativeDongBytes } from "../../src/data/registry/mois-administrative-dong";
import { buildRegistryPublicationSql } from "../../src/data/registry/publication-sql";
import { parseNamedArgs } from "./cli-args";

const SOURCE_URL = "https://www.mois.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_00146280tlU2Y2B&fileSn=0";
const SOURCE_SHA256 = "0b9f143fb6e43657ff72c863ac1412cc4be43e79dce323aac602fb7754663898";
const REGISTRY_VERSION = "mois-20260701";
const EFFECTIVE_DATE = "2026-07-01";

async function main(): Promise<void> {
  const args = parseNamedArgs(process.argv.slice(2), ["input", "output"]);
  const bytes = await readFile(args.input);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  if (sourceSha256 !== SOURCE_SHA256) throw new Error("MOIS registry archive sha256 does not match the recorded evidence");
  const entry = new AdmZip(bytes).getEntries().find(item => item.entryName.includes("KIKcd_H."));
  if (!entry) throw new Error("MOIS registry archive is missing KIKcd_H");
  const entries = parseMoisAdministrativeDongBytes(entry.getData(), EFFECTIVE_DATE);
  const sql = buildRegistryPublicationSql({
    registryVersionId: REGISTRY_VERSION,
    evidenceId: `mois-jscode-${EFFECTIVE_DATE}`,
    sourceUrl: SOURCE_URL,
    sourceSha256,
    entries,
    snapshotId: "registry-snapshot-20260701",
    operationId: "registry-publish-20260701",
    channel: "production",
    expectedGeneration: 0,
  });
  await writeFile(args.output, sql, "utf8");
  console.log(JSON.stringify({ registryVersion: REGISTRY_VERSION, sourceSha256, entries: entries.length, output: args.output }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
