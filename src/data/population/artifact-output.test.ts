import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { MonthAggregation } from "./aggregate-month";
import { readCandidateOutcome, readMonthlyOutput, writeNormalizationOutput } from "./artifact-output";

const directories: string[] = [];
async function target() {
  const directory = await mkdtemp(path.join(tmpdir(), "population-output-"));
  directories.push(directory);
  return path.join(directory, "result");
}
const month = (): MonthAggregation => ({
  period: "202602", status: "incomplete", expectedSlotsPerDong: 672,
  observedSlots: 1, errors: [], diagnostics: { counts: {}, samples: [] }, methodStatus: "unverified", input: { period: "202602", asOfDate: "2026-03-01", sourceId: "OA-23016", schemaVersion: "oa23016-hourly-v1",
    method: { status: "unverified", version: null, evidenceIds: [] }, registry: null }, coverageStatus: "observed_only",
  dongs: { "00123456": { dongCode: "00123456", count: 1, sumMicros: BigInt(123456789),
    mean: null, missingSlots: 671, status: "incomplete", firstDate: "20260201", lastDate: "20260201", missingRate: 671 / 672 } },
});
const metadata = () => ({ sourceSha256: "a".repeat(64), contract: { ...month().input!, expectedSha256: "a".repeat(64) } });
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("population artifact publication", () => {
  it("round trips a leading-zero code and exact sums", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), metadata());
    expect(await readMonthlyOutput(output)).toEqual(month());
  });

  it("requires a verified source hash and a normalization contract that matches the monthly input", async () => {
    const output = await target();
    await expect(writeNormalizationOutput(output, month(), {})).rejects.toThrow(/source|contract/);
    await expect(writeNormalizationOutput(output, month(), { ...metadata(), sourceSha256: "b".repeat(64) })).rejects.toThrow(/contract/);
  });

  it("keeps invalid runs diagnostic-only without a completion marker", async () => {
    const output = await target();
    await writeNormalizationOutput(output, { ...month(), status: "invalid", dongs: {}, errors: ["duplicate slot"], diagnostics: { counts: { duplicate_slot: 1 }, samples: [] } }, metadata());
    expect((await readdir(output)).sort()).toEqual(["errors.json", "failure.json", "run.json"]);
    await expect(readMonthlyOutput(output)).rejects.toThrow();
  });

  it("reads an explicitly failed candidate without treating missing completion as failure", async () => {
    const output = await target();
    await writeNormalizationOutput(output, { ...month(), status: "invalid", dongs: {}, errors: ["duplicate slot"], diagnostics: { counts: { duplicate_slot: 1 }, samples: [] } }, metadata());
    await expect(readCandidateOutcome(output)).resolves.toMatchObject({ kind: "invalid", period: "202602" });
  });

  it("rejects a failure directory with mismatched diagnostics", async () => {
    const output = await target();
    await writeNormalizationOutput(output, { ...month(), status: "invalid", dongs: {}, errors: ["duplicate slot"], diagnostics: { counts: { duplicate_slot: 1 }, samples: [] } }, metadata());
    await writeFile(path.join(output, "errors.json"), JSON.stringify({ period: "202601", errors: ["wrong period"], diagnostics: { counts: { source_error: 1 }, samples: [] } }));
    await expect(readCandidateOutcome(output)).rejects.toThrow(/hash mismatch/);
  });

  it("keeps the content manifest stable when run metadata changes", async () => {
    const first = await target();
    const second = await target();
    await writeNormalizationOutput(first, month(), { ...metadata(), startedAt: "2026-09-07T00:00:00Z" });
    await writeNormalizationOutput(second, month(), { ...metadata(), startedAt: "2026-09-07T00:01:00Z" });
    expect(JSON.parse(await readFile(path.join(first, "manifest.json"), "utf8"))).toMatchObject({ formatVersion: 2, kind: "population-normalization" });
    expect(await readFile(path.join(first, "manifest.json"), "utf8")).toBe(await readFile(path.join(second, "manifest.json"), "utf8"));
    expect(await readMonthlyOutput(first)).toEqual(month());
    expect(await readMonthlyOutput(second)).toEqual(month());
  });

  it("rejects changed run metadata even when monthly data is intact", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), metadata());
    await writeFile(path.join(output, "run.json"), "{}\n");
    await expect(readMonthlyOutput(output)).rejects.toThrow(/hash mismatch/);
  });

  it("rejects changed monthly data", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), metadata());
    await writeFile(path.join(output, "monthly.json"), "{}\n");
    await expect(readMonthlyOutput(output)).rejects.toThrow(/hash mismatch/);
  });

  it("preserves existing outputs and cleans its own staging directory", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), metadata());
    const before = await readFile(path.join(output, "complete.json"), "utf8");
    await expect(writeNormalizationOutput(output, month(), { ...metadata(), replacement: true })).rejects.toThrow();
    expect(await readFile(path.join(output, "complete.json"), "utf8")).toBe(before);
    expect(await readdir(path.dirname(output))).toEqual(["result"]);
  });

  it("allows exactly one concurrent writer to publish an output", async () => {
    const output = await target();
    const results = await Promise.allSettled([
      writeNormalizationOutput(output, month(), metadata()),
      writeNormalizationOutput(output, month(), metadata()),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await readdir(output)).toContain("complete.json");
    expect((await readdir(path.dirname(output))).filter(name => name.includes(".tmp-")).length).toBe(0);
  });

  it("rejects a directory containing both success and failure markers", async () => {
    const output = await target();
    await writeNormalizationOutput(output, month(), metadata());
    await writeFile(path.join(output, "failure.json"), JSON.stringify({ formatVersion: 2, kind: "population-normalization-failure", errorsSha256: "a".repeat(64), runSha256: "b".repeat(64) }));
    await expect(readCandidateOutcome(output)).rejects.toThrow(/both/);
  });

  it("rejects a legacy output without a versioned marker", async () => {
    const output = await target();
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "monthly.json"), "{}\n");
    await expect(readCandidateOutcome(output)).rejects.toThrow(/marker|formatVersion|unsupported/);
  });
});
