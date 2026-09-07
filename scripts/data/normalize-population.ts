import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { aggregateMonth } from "../../src/data/population/aggregate-month";
import { parseNormalizationContract } from "../../src/data/population/contract";
import type { NormalizationContract } from "../../src/data/population/types";
import { writeNormalizationOutput } from "../../src/data/population/artifact-output";
import { POPULATION_READ_LIMITS, readPopulationRowsFromBytes, type EntryMetadata } from "../../src/data/population/read-rows";
import { parseNamedArgs } from "./cli-args";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: Record<string, string>;
  let contract: NormalizationContract;
  try {
    args = parseNamedArgs(argv[0] === "--" ? argv.slice(1) : argv, ["input", "contract", "output-dir", "work-root"]);
    const value: unknown = JSON.parse(await readFile(args.contract, "utf8"));
    contract = parseNormalizationContract(value);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if ((await stat(args.input)).size > POPULATION_READ_LIMITS.archiveBytes) throw new Error("population archive exceeds limit");
  const { expectedSha256, ...monthInput } = contract;
  const startedAt = new Date().toISOString();
  const startedAtMonotonic = performance.now();
  const inputBytes = await readFile(args.input);
  const sourceByteLength = inputBytes.byteLength;
  if (sourceByteLength > POPULATION_READ_LIMITS.archiveBytes) throw new Error("population archive exceeds limit");
  const actualSha256 = createHash("sha256").update(inputBytes).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("input sha256 mismatch");
  const entries: EntryMetadata[] = [];
  const monthly = await aggregateMonth(readPopulationRowsFromBytes(inputBytes, args.input, (metadata) => entries.push(metadata)), monthInput);
  const finishedAt = new Date().toISOString();
  const elapsedMs = Math.max(0, Math.round(performance.now() - startedAtMonotonic));
  await writeNormalizationOutput(args["output-dir"], monthly, {
    period: contract.period, input: args.input, contract, sourceSha256: actualSha256,
    sourceByteLength, entries, status: monthly.status, startedAt, finishedAt, elapsedMs,
    rssAtEndBytes: process.memoryUsage().rss, runtime: process.version,
    processingVersion: "population-normalization-v2",
  }, { workRoot: args["work-root"] ?? path.resolve("data/work") });
  if (monthly.status === "invalid") process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
