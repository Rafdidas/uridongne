import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MonthAggregation } from "./aggregate-month";
import { parseFailureEnvelope, parseSuccessManifest, type PopulationFailureEnvelope, type PopulationSuccessManifest } from "./artifact-contract";
import { fromMonthResult, parseMonthResult, toMonthResult, type MonthErrors, type MonthResult } from "./month-result";
import { assertPopulationOutputPath } from "./output-path";

export interface PopulationOutputOptions { workRoot?: string }

export type PopulationCandidateOutcome =
  | { kind: "success"; monthly: MonthAggregation }
  | { kind: "invalid"; period: string; reasons: string[]; diagnostics: MonthErrors };

function json(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashJson(value: unknown): string {
  return hashBytes(Buffer.from(json(value), "utf8"));
}

function metadataHash(metadata: Record<string, unknown>, field: string): string {
  const value = metadata[field];
  if (field === "sourceSha256" && typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  if (field === "contract") return hashJson(value ?? null);
  return hashJson(null);
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

function runMetadata(metadata: Record<string, unknown>, period: string, status: "valid" | "invalid"): Record<string, unknown> {
  return {
    ...metadata, period, kind: "population-normalization", status,
    processingVersion: typeof metadata.processingVersion === "string" ? metadata.processingVersion : "population-normalization-v2",
    sourceSha256: metadataHash(metadata, "sourceSha256"),
  };
}

export async function writeNormalizationOutput(outputDir: string, monthly: MonthAggregation, metadata: Record<string, unknown>, options: PopulationOutputOptions = {}): Promise<void> {
  const validatedOutputDir = options.workRoot ? await assertPopulationOutputPath(outputDir, options.workRoot) : outputDir;
  outputDir = validatedOutputDir;
  const parent = path.dirname(outputDir);
  const staging = await createStaging(outputDir);
  try {
    const run = runMetadata(metadata, monthly.period, monthly.status === "invalid" ? "invalid" : "valid");
    const contractSha256 = hashJson(run.contract ?? null);
    if (monthly.status === "invalid") {
      const errors = toMonthResult(monthly);
      const errorsText = json(errors);
      const runText = json({ ...run, contractSha256 });
      await writeFile(path.join(staging, "errors.json"), errorsText, "utf8");
      await writeFile(path.join(staging, "run.json"), runText, "utf8");
      const failure: PopulationFailureEnvelope = { formatVersion: 2, kind: "population-normalization-failure", errorsSha256: hashBytes(Buffer.from(errorsText)), runSha256: hashBytes(Buffer.from(runText)) };
      await writeFile(path.join(staging, "failure.json"), json(failure), "utf8");
      await rename(staging, outputDir);
      return;
    }
    const monthlyText = json(toMonthResult(monthly));
    const runText = json({ ...run, contractSha256 });
    await writeFile(path.join(staging, "monthly.json"), monthlyText, "utf8");
    await writeFile(path.join(staging, "run.json"), runText, "utf8");
    const manifest: PopulationSuccessManifest = {
      formatVersion: 2, kind: "population-normalization", processingVersion: run.processingVersion as string,
      sourceSha256: run.sourceSha256 as string, contractSha256, files: { "monthly.json": hashBytes(Buffer.from(monthlyText)) },
    };
    const manifestText = json(manifest);
    await writeFile(path.join(staging, "manifest.json"), manifestText, "utf8");
    await writeFile(path.join(staging, "complete.json"), json({ formatVersion: 2, manifestSha256: hashBytes(Buffer.from(manifestText)), runSha256: hashBytes(Buffer.from(runText)) }), "utf8");
    await mkdir(parent, { recursive: true });
    await rename(staging, outputDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function writeComparisonOutput(outputDir: string, comparison: unknown, metadata: Record<string, unknown> = {}, options: PopulationOutputOptions = {}): Promise<void> {
  const validatedOutputDir = options.workRoot ? await assertPopulationOutputPath(outputDir, options.workRoot) : outputDir;
  outputDir = validatedOutputDir;
  const parent = path.dirname(outputDir);
  const staging = await createStaging(outputDir);
  try {
    const comparisonText = json(comparison);
    const runText = json({ kind: "population-comparison", ...metadata });
    await writeFile(path.join(staging, "comparison.json"), comparisonText, "utf8");
    await writeFile(path.join(staging, "run.json"), runText, "utf8");
    const manifest = {
      formatVersion: 2, kind: "population-comparison", processingVersion: typeof metadata.processingVersion === "string" ? metadata.processingVersion : "population-comparison-v2",
      sourceSha256: metadataHash(metadata, "sourceSha256"), contractSha256: metadataHash(metadata, "contract"), files: { "comparison.json": hashBytes(Buffer.from(comparisonText)) },
    };
    const manifestText = json(manifest);
    await writeFile(path.join(staging, "manifest.json"), manifestText, "utf8");
    await writeFile(path.join(staging, "complete.json"), json({ formatVersion: 2, manifestSha256: hashBytes(Buffer.from(manifestText)), runSha256: hashBytes(Buffer.from(runText)) }), "utf8");
    await mkdir(parent, { recursive: true });
    await rename(staging, outputDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function readSuccess(outputDir: string): Promise<MonthResult> {
  const complete = JSON.parse((await readFile(path.join(outputDir, "complete.json"))).toString("utf8")) as { formatVersion?: number; manifestSha256?: string; runSha256?: string };
  if (complete.formatVersion !== 2 || typeof complete.manifestSha256 !== "string" || typeof complete.runSha256 !== "string") throw new Error("unsupported population complete formatVersion");
  const manifestBytes = await readFile(path.join(outputDir, "manifest.json"));
  if (hashBytes(manifestBytes) !== complete.manifestSha256) throw new Error("population output manifest mismatch");
  const manifest = parseSuccessManifest(JSON.parse(manifestBytes.toString("utf8")));
  const runBytes = await readFile(path.join(outputDir, "run.json"));
  if (hashBytes(runBytes) !== complete.runSha256) throw new Error("population run.json hash mismatch");
  const run = JSON.parse(runBytes.toString("utf8")) as Record<string, unknown>;
  if (run.kind !== "population-normalization" || run.status !== "valid" || run.processingVersion !== manifest.processingVersion || run.sourceSha256 !== manifest.sourceSha256 || run.contractSha256 !== manifest.contractSha256) throw new Error("population run metadata mismatch");
  const monthlyBytes = await readFile(path.join(outputDir, "monthly.json"));
  if (hashBytes(monthlyBytes) !== manifest.files["monthly.json"]) throw new Error("population monthly.json hash mismatch");
  const monthly = parseMonthResult(JSON.parse(monthlyBytes.toString("utf8")));
  if (monthly.status !== "valid" || run.period !== monthly.input.period || hashJson(run.contract ?? null) !== manifest.contractSha256) throw new Error("population run input mismatch");
  return monthly;
}

export async function readMonthlyOutput(outputDir: string): Promise<MonthAggregation> {
  return fromMonthResult(await readSuccess(outputDir));
}

async function readFailure(outputDir: string): Promise<PopulationCandidateOutcome> {
  const failure = parseFailureEnvelope(JSON.parse((await readFile(path.join(outputDir, "failure.json"))).toString("utf8")));
  const errorsBytes = await readFile(path.join(outputDir, "errors.json"));
  if (hashBytes(errorsBytes) !== failure.errorsSha256) throw new Error("population errors.json hash mismatch");
  const runBytes = await readFile(path.join(outputDir, "run.json"));
  if (hashBytes(runBytes) !== failure.runSha256) throw new Error("population failure run.json hash mismatch");
  const errors = parseMonthResult(JSON.parse(errorsBytes.toString("utf8")));
  const run = JSON.parse(runBytes.toString("utf8")) as Record<string, unknown>;
  if (errors.status !== "invalid" || run.kind !== "population-normalization" || run.status !== "invalid" || run.period !== errors.input.period || run.contractSha256 !== hashJson(run.contract ?? null)) throw new Error("population failure metadata mismatch");
  return { kind: "invalid", period: errors.input.period, reasons: Object.keys(errors.errors.counts), diagnostics: errors.errors };
}

async function exists(filePath: string): Promise<boolean> {
  try { await lstat(filePath); return true; } catch { return false; }
}

export async function readCandidateOutcome(outputDir: string): Promise<PopulationCandidateOutcome> {
  const hasComplete = await exists(path.join(outputDir, "complete.json"));
  const hasFailure = await exists(path.join(outputDir, "failure.json"));
  if (hasComplete && hasFailure) throw new Error("population output has both complete and failure markers");
  if (hasComplete) return { kind: "success", monthly: await readMonthlyOutput(outputDir) };
  if (hasFailure) return readFailure(outputDir);
  throw new Error("population output has no supported completion marker; legacy output is unsupported");
}
