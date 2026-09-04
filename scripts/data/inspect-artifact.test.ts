import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..", "..");

describe("inspect-artifact CLI", () => {
  it("writes a deterministic metadata profile without emitting source rows beyond the sample limit", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uridongne-inspect-"));
    const outputPath = path.join(directory, "profile.json");
    const fixturePath = path.join(projectRoot, "src", "data", "profiling", "__fixtures__", "store-sample.csv");
    const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const scriptPath = path.join(scriptsDirectory, "inspect-artifact.ts");
    const schema = JSON.stringify({
      quarter: "STDR_YYQU_CD",
      dongCode: "ADSTRD_CD",
      industryCode: "SVC_INDUTY_CD",
      totalStoreCount: "SIMILR_INDUTY_STOR_CO",
      nonFranchiseStoreCount: "STOR_CO",
      franchiseStoreCount: "FRC_STOR_CO",
      openingCount: "STOR_CO",
      closingCount: "FRC_STOR_CO",
    });

    try {
      await execFileAsync(process.execPath, [
        tsxCli,
        scriptPath,
        "--kind",
        "store",
        "--period",
        "2025",
        "--input",
        fixturePath,
        "--output",
        outputPath,
        "--schema",
        schema,
      ]);
      const profile = JSON.parse(await readFile(outputPath, "utf8"));

      expect(profile).toMatchObject({
        sourceKind: "store",
        period: "2025",
        inputName: "store-sample.csv",
        invariants: {
          duplicateKeyCount: 0,
          totalMismatchCount: 0,
          negativeCount: 0,
          nonIntegerCount: 0,
          quarterValues: ["20251"],
          dongCodeLengths: { "8": 1 },
          dongCodeValues: ["11440660"],
        },
      });
      expect(profile.entries).toHaveLength(1);
      expect(profile.entries[0].firstRows).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
