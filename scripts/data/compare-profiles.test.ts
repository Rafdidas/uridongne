import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ArtifactProfile } from "../../src/data/profiling/types";

const execFileAsync = promisify(execFile);
const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..", "..");

function profile(period: string): ArtifactProfile {
  return {
    sourceKind: "population",
    period,
    inputName: `${period}.zip`,
    byteLength: 10,
    sha256: "0".repeat(64),
    entries: [{
      name: `${period}.csv`,
      byteLength: 10,
      encoding: "utf8",
      delimiter: ",",
      headers: ["기준일ID", "시간대구분", "행정동코드", "총생활인구수"],
      rowCount: 1,
      nullTokens: {},
      numeric: {},
      firstRows: [],
    }],
  };
}

describe("compare-profiles CLI", () => {
  it("writes the same-month-previous-year decision for matching profiles", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uridongne-compare-"));
    const currentPath = path.join(directory, "current.json");
    const previousYearPath = path.join(directory, "previous-year.json");
    const previousMonthPath = path.join(directory, "previous-month.json");
    const outputPath = path.join(directory, "comparison.json");
    const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const scriptPath = path.join(scriptsDirectory, "compare-profiles.ts");

    try {
      await Promise.all([
        writeFile(currentPath, JSON.stringify(profile("202607"))),
        writeFile(previousYearPath, JSON.stringify(profile("202507"))),
        writeFile(previousMonthPath, JSON.stringify(profile("202606"))),
      ]);
      await execFileAsync(process.execPath, [
        tsxCli,
        scriptPath,
        "--current", currentPath,
        "--previous-year", previousYearPath,
        "--previous-month", previousMonthPath,
        "--output", outputPath,
      ]);

      expect(JSON.parse(await readFile(outputPath, "utf8"))).toMatchObject({
        comparisonMode: "same_month_previous_year",
        comparisonPeriod: "202507",
        compatible: true,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
