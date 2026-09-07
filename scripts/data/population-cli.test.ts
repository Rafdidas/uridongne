import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { writeNormalizationOutput } from "../../src/data/population/artifact-output";
import type { MonthAggregation } from "../../src/data/population/aggregate-month";
import { POPULATION_HEADERS } from "../../src/data/population/schema";

const contractInput = (period = "202602") => ({
  period, asOfDate: "2026-09-07", sourceId: "OA-23016" as const, schemaVersion: "oa23016-hourly-v1",
  method: { status: "unverified" as const, version: null, evidenceIds: [] as string[] }, registry: null,
});
const exec = promisify(execFile);
const directories: string[] = [];
async function workspace() {
  const directory = await mkdtemp(path.join(tmpdir(), "population-cli-"));
  directories.push(directory);
  return directory;
}
async function run(script: string, args: string[]) {
  try {
    await exec(process.execPath, ["--import", "tsx", path.resolve("scripts/data", script), ...args]);
    return 0;
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    if (typeof failure.code !== "number") throw error;
    return failure.code;
  }
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("population CLI publication boundary", () => {
  it("leaves diagnostics but no published monthly artifact for an invalid observation", async () => {
    const directory = await workspace();
    const input = path.join(directory, "input.csv");
    const contract = path.join(directory, "contract.json");
    const output = path.join(directory, "output");
    const csv = POPULATION_HEADERS.join(",") + "\n" + ["20260201", "00", "00123456", "*", ...Array(28).fill("*")].join(",") + "\n";
    await writeFile(input, csv);
    await writeFile(contract, JSON.stringify({ ...contractInput(), expectedSha256: createHash("sha256").update(csv).digest("hex") }));
    expect(await run("normalize-population.ts", ["--input", input, "--contract", contract, "--output-dir", output])).toBe(2);
    expect((await readdir(output)).sort()).toEqual(["errors.json", "run.json"]);
  });

  it.each([
    { ...contractInput(), expectedSha256: "bad" },
    { ...contractInput(), expectedSha256: "a".repeat(64), asOfDate: "2026-02-28" },
    { ...contractInput(), expectedSha256: "a".repeat(64), method: { status: "verified", version: "v1", evidenceIds: [] } },
    { period: "202602" },
  ])("rejects configuration before opening the source %#", async value => {
    const directory = await workspace();
    const contract = path.join(directory, "contract.json");
    await writeFile(contract, JSON.stringify(value));
    const code = await run("normalize-population.ts", ["--input", path.join(directory, "nonexistent.csv"),
      "--contract", contract, "--output-dir", path.join(directory, "output")]);
    expect(code).toBe(1);
    expect(await readdir(directory)).toEqual(["contract.json"]);
  });

  it("publishes the validated contract and coverage without fabricating a method version", async () => {
    const directory = await workspace();
    const input = path.join(directory, "input.csv"), contract = path.join(directory, "contract.json");
    const csv = POPULATION_HEADERS.join(",") + "\n" + ["20260201", "0", "00123456", "150", ...Array(28).fill("*")].join(",") + "\n";
    await writeFile(input, csv);
    await writeFile(contract, JSON.stringify({ ...contractInput(), expectedSha256: createHash("sha256").update(csv).digest("hex") }));
    const output = path.join(directory, "output");
    expect(await run("normalize-population.ts", ["--input", input, "--contract", contract, "--output-dir", output])).toBe(0);
    const monthly = JSON.parse(await readFile(path.join(output, "monthly.json"), "utf8"));
    expect(monthly).toMatchObject({ input: contractInput(), coverageStatus: "observed_only" });
    expect(monthly.methodId).toBeUndefined();
  });

  it("rejects a source hash mismatch without publishing", async () => {
    const directory = await workspace();
    const input = path.join(directory, "input.csv"), contract = path.join(directory, "contract.json");
    await writeFile(input, "wrong source");
    await writeFile(contract, JSON.stringify({ ...contractInput(), expectedSha256: "a".repeat(64) }));
    expect(await run("normalize-population.ts", ["--input", input, "--contract", contract, "--output-dir", path.join(directory, "output")])).toBe(2);
    expect((await readdir(directory)).sort()).toEqual(["contract.json", "input.csv"]);
  });

  it.each([false, true])("returns the comparison result status for verified=%s", async (verified) => {
    const directory = await workspace();
    const dirs = ["current", "year", "month"].map(name => path.join(directory, name));
    const periods = ["202607", "202507", "202606"];
    for (let index = 0; index < dirs.length; index += 1) {
      const monthly: MonthAggregation = {
        period: periods[index], status: "complete", expectedSlotsPerDong: 1, observedSlots: 1,
        errors: [], methodId: "fixture", methodStatus: verified ? "verified" : "unverified",
        input: { ...contractInput(periods[index]),
          method: verified ? { status: "verified", version: "fixture", evidenceIds: ["fixture-method-document"] }
            : { status: "unverified", version: null, evidenceIds: [] } },
        dongs: { "00123456": { dongCode: "00123456", count: 1, sumMicros: BigInt(100000000), mean: "100.000000", missingSlots: 0, status: "complete" } },
      };
      await writeNormalizationOutput(dirs[index], monthly, {});
    }
    const changes = path.join(directory, "changes.json");
    await writeFile(changes, "[]");
    const output = path.join(directory, "comparison");
    expect(await run("compare-population.ts", [
      "--current-dir", dirs[0], "--previous-year-dir", dirs[1], "--previous-month-dir", dirs[2],
      "--changes", changes, "--output-dir", output,
    ])).toBe(verified ? 0 : 2);
    const result = JSON.parse(await readFile(path.join(output, "comparison.json"), "utf8"));
    expect(result.comparisons[0].mode).toBe(verified ? "same_month_previous_year" : "unavailable");
  });
});
