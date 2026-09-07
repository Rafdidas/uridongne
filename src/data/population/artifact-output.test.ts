import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { MonthAggregation } from "./aggregate-month";
import { readMonthlyOutput, writeNormalizationOutput } from "./artifact-output";

const directories: string[] = [];
async function target() {
  const directory = await mkdtemp(path.join(tmpdir(), "population-output-"));
  directories.push(directory);
  return path.join(directory, "result");
}
const month = (): MonthAggregation => ({
  period: "202602", status: "incomplete", expectedSlotsPerDong: 672,
  observedSlots: 1, errors: [],
  dongs: { "00123456": { dongCode: "00123456", count: 1, sumMicros: BigInt(123456789),
    mean: null, missingSlots: 671, status: "incomplete" } },
});
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("population artifact publication", () => {
  it("round trips a leading-zero code and exact sums", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), {});
    expect(await readMonthlyOutput(output)).toEqual(month());
  });

  it("keeps invalid runs diagnostic-only without a completion marker", async () => {
    const output = await target();
    await writeNormalizationOutput(output, { ...month(), status: "invalid", dongs: {}, errors: ["duplicate slot"] }, {});
    expect((await readdir(output)).sort()).toEqual(["errors.json", "run.json"]);
    await expect(readMonthlyOutput(output)).rejects.toThrow();
  });

  it("rejects changed run metadata even when monthly data is intact", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), {});
    await writeFile(path.join(output, "run.json"), "{}\n");
    await expect(readMonthlyOutput(output)).rejects.toThrow(/hash mismatch/);
  });

  it("rejects changed monthly data", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), {});
    await writeFile(path.join(output, "monthly.json"), "{}\n");
    await expect(readMonthlyOutput(output)).rejects.toThrow(/hash mismatch/);
  });

  it("preserves existing outputs and cleans its own staging directory", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), {});
    const before = await readFile(path.join(output, "complete.json"), "utf8");
    await expect(writeNormalizationOutput(output, month(), { replacement: true })).rejects.toThrow();
    expect(await readFile(path.join(output, "complete.json"), "utf8")).toBe(before);
    expect(await readdir(path.dirname(output))).toEqual(["result"]);
  });
});
