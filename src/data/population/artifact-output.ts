import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MonthAggregation } from "./aggregate-month";

function json(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function writeNormalizationOutput(outputDir: string, monthly: MonthAggregation, metadata: Record<string, unknown>): Promise<void> {
  const parent = path.dirname(outputDir);
  const staging = `${outputDir}.tmp-${process.pid}-${Date.now()}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    await writeFile(path.join(staging, "monthly.json"), json(monthly), "utf8");
    await writeFile(path.join(staging, "run.json"), json({ kind: "population-normalization", ...metadata }), "utf8");
    const manifest = { files: { "monthly.json": await sha256(path.join(staging, "monthly.json")), "run.json": await sha256(path.join(staging, "run.json")) } };
    await writeFile(path.join(staging, "manifest.json"), json(manifest), "utf8");
    await writeFile(path.join(staging, "complete.json"), json({ manifestSha256: createHash("sha256").update(json(manifest)).digest("hex") }), "utf8");
    await mkdir(parent, { recursive: true });
    await rename(staging, outputDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function writeComparisonOutput(outputDir: string, comparison: unknown, metadata: Record<string, unknown> = {}): Promise<void> {
  const parent = path.dirname(outputDir);
  const staging = `${outputDir}.tmp-${process.pid}-${Date.now()}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    await writeFile(path.join(staging, "comparison.json"), json(comparison), "utf8");
    await writeFile(path.join(staging, "run.json"), json({ kind: "population-comparison", ...metadata }), "utf8");
    const manifest = { files: { "comparison.json": await sha256(path.join(staging, "comparison.json")), "run.json": await sha256(path.join(staging, "run.json")) } };
    await writeFile(path.join(staging, "manifest.json"), json(manifest), "utf8");
    await writeFile(path.join(staging, "complete.json"), json({ manifestSha256: createHash("sha256").update(json(manifest)).digest("hex") }), "utf8");
    await mkdir(parent, { recursive: true });
    await rename(staging, outputDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function readMonthlyOutput(outputDir: string): Promise<MonthAggregation> {
  const complete = JSON.parse(await readFile(path.join(outputDir, "complete.json"), "utf8")) as { manifestSha256?: string };
  const manifestText = await readFile(path.join(outputDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as { files?: Record<string, string> };
  if (!complete.manifestSha256 || createHash("sha256").update(manifestText).digest("hex") !== complete.manifestSha256) throw new Error("population output manifest mismatch");
  if (manifest.files?.["monthly.json"] !== await sha256(path.join(outputDir, "monthly.json"))) throw new Error("population monthly hash mismatch");
  const monthly = JSON.parse(await readFile(path.join(outputDir, "monthly.json"), "utf8")) as MonthAggregation;
  for (const dong of Object.values(monthly.dongs)) dong.sumMicros = BigInt(String(dong.sumMicros));
  return monthly;
}
