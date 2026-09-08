import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import AdmZip from "adm-zip";
import Database from "better-sqlite3";

import { SnapshotRepository } from "../../src/data/publication/snapshot-repository";
import { parseMoisAdministrativeDongBytes } from "../../src/data/registry/mois-administrative-dong";
import { parseNamedArgs } from "./cli-args";

const SOURCE_URL = "https://www.mois.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_00146280tlU2Y2B&fileSn=0";
const REGISTRY_VERSION = "mois-20260701";
const EFFECTIVE_DATE = "2026-07-01";

async function main(): Promise<void> {
  const args = parseNamedArgs(process.argv.slice(2), ["input", "database"]);
  const bytes = await readFile(args.input);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const zip = new AdmZip(bytes);
  const entry = zip.getEntries().find(item => item.entryName.includes("KIKcd_H."));
  if (!entry) throw new Error("MOIS registry archive is missing KIKcd_H");
  const database = new Database(args.database);
  try {
    database.pragma("foreign_keys = ON");
    const repository = new SnapshotRepository(database);
    repository.migrate();
    const entries = parseMoisAdministrativeDongBytes(entry.getData(), EFFECTIVE_DATE);
    repository.ingestDongRegistry({
      id: REGISTRY_VERSION,
      evidence: { id: `mois-jscode-${EFFECTIVE_DATE}`, sourceUrl: SOURCE_URL, sha256: sourceSha256 },
      entries,
    });
    console.log(JSON.stringify({ registryVersion: REGISTRY_VERSION, sourceSha256, entries: entries.length }));
  } finally {
    database.close();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
