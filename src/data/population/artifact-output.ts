import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MonthAggregation } from "./aggregate-month";
import { fromMonthResult, parseMonthResult, toMonthResult } from "./month-result";

export type PopulationCandidateOutcome =
  | { kind: "success"; monthly: MonthAggregation }
  | { kind: "invalid"; period: string; reasons: string[]; diagnostics: Record<string, unknown> };

function json(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function createStaging(outputDir: string): Promise<string> {
  try {
    await lstat(outputDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path.dirname(outputDir), { recursive: true });
    return mkdtemp(`${outputDir}.tmp-`);
  }
  throw new Error("population output already exists");
}

export async function writeNormalizationOutput(outputDir: string, monthly: MonthAggregation, metadata: Record<string, unknown>): Promise<void> {
  const parent = path.dirname(outputDir);
  const staging = await createStaging(outputDir);
  try {
    if (monthly.status === "invalid") {
      await writeFile(path.join(staging, "errors.json"), json({ period: monthly.period, status: "invalid", errors: monthly.errors, diagnostics: monthly.diagnostics }), "utf8");
      await writeFile(path.join(staging, "run.json"), json({ ...metadata, period: monthly.period, kind: "population-normalization", status: "invalid" }), "utf8");
      await rename(staging, outputDir);
      return;
    }
    await writeFile(path.join(staging, "monthly.json"), json(toMonthResult(monthly)), "utf8");
    await writeFile(path.join(staging, "run.json"), json({ kind: "population-normalization", ...metadata }), "utf8");
    const manifest = { files: { "monthly.json": await sha256(path.join(staging, "monthly.json")) } };
    await writeFile(path.join(staging, "manifest.json"), json(manifest), "utf8");
    await writeFile(path.join(staging, "complete.json"), json({ manifestSha256: createHash("sha256").update(json(manifest)).digest("hex"), runSha256: await sha256(path.join(staging, "run.json")) }), "utf8");
    await mkdir(parent, { recursive: true });
    await rename(staging, outputDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function writeComparisonOutput(outputDir: string, comparison: unknown, metadata: Record<string, unknown> = {}): Promise<void> {
  const parent = path.dirname(outputDir);
  const staging = await createStaging(outputDir);
  try {
    await writeFile(path.join(staging, "comparison.json"), json(comparison), "utf8");
    await writeFile(path.join(staging, "run.json"), json({ kind: "population-comparison", ...metadata }), "utf8");
    const manifest = { files: { "comparison.json": await sha256(path.join(staging, "comparison.json")) } };
    await writeFile(path.join(staging, "manifest.json"), json(manifest), "utf8");
    await writeFile(path.join(staging, "complete.json"), json({ manifestSha256: createHash("sha256").update(json(manifest)).digest("hex"), runSha256: await sha256(path.join(staging, "run.json")) }), "utf8");
    await mkdir(parent, { recursive: true });
    await rename(staging, outputDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function readMonthlyOutput(outputDir: string): Promise<MonthAggregation> {
  const complete = JSON.parse(await readFile(path.join(outputDir, "complete.json"), "utf8")) as { manifestSha256?: string; runSha256?: string };
  const manifestText = await readFile(path.join(outputDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as { files?: Record<string, string> };
  if (!complete.manifestSha256 || createHash("sha256").update(manifestText).digest("hex") !== complete.manifestSha256) throw new Error("population output manifest mismatch");
  if (!manifest.files || Object.keys(manifest.files).sort().join(",") !== "monthly.json" || !complete.runSha256) {
    throw new Error("population output manifest files mismatch");
  }
  if (manifest.files["monthly.json"] !== await sha256(path.join(outputDir, "monthly.json"))) throw new Error("population monthly.json hash mismatch");
  if (complete.runSha256 !== await sha256(path.join(outputDir, "run.json"))) throw new Error("population run.json hash mismatch");
  const monthly = parseMonthResult(JSON.parse(await readFile(path.join(outputDir, "monthly.json"), "utf8")));
  return fromMonthResult(monthly);
}

export async function readCandidateOutcome(outputDir: string): Promise<PopulationCandidateOutcome> {
  try {
    return { kind: "success", monthly: await readMonthlyOutput(outputDir) };
  } catch (successError) {
    let run: unknown;
    let failure: unknown;
    try {
      run = JSON.parse(await readFile(path.join(outputDir, "run.json"), "utf8"));
      failure = JSON.parse(await readFile(path.join(outputDir, "errors.json"), "utf8"));
    } catch {
      throw successError;
    }
    if (!run || typeof run !== "object" || Array.isArray(run) || !failure || typeof failure !== "object" || Array.isArray(failure)) throw successError;
    const runRecord = run as Record<string, unknown>;
    const failureRecord = failure as Record<string, unknown>;
    if (runRecord.kind !== "population-normalization" || runRecord.status !== "invalid" || failureRecord.status !== "invalid" || runRecord.period !== failureRecord.period || typeof failureRecord.period !== "string") throw new Error("population failure period/status mismatch");
    if (!Array.isArray(failureRecord.errors) || failureRecord.errors.length === 0 || failureRecord.errors.some(item => typeof item !== "string")) throw new Error("invalid population failure diagnostics");
    if (!failureRecord.diagnostics || typeof failureRecord.diagnostics !== "object" || Array.isArray(failureRecord.diagnostics)) throw new Error("missing population failure diagnostics");
    return { kind: "invalid", period: failureRecord.period, reasons: failureRecord.errors, diagnostics: failureRecord.diagnostics as Record<string, unknown> };
  }
}
