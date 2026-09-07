import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

import { aggregateMonth } from "../../src/data/population/aggregate-month";
import { parseNormalizationContract } from "../../src/data/population/contract";
import type { NormalizationContract } from "../../src/data/population/types";
import { writeNormalizationOutput } from "../../src/data/population/artifact-output";
import { POPULATION_READ_LIMITS, readPopulationRows, type EntryMetadata } from "../../src/data/population/read-rows";
import { parseNamedArgs } from "./cli-args";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: Record<string, string>;
  let contract: NormalizationContract;
  try {
    args = parseNamedArgs(argv[0] === "--" ? argv.slice(1) : argv, ["input", "contract", "output-dir"]);
    const value: unknown = JSON.parse(await readFile(args.contract, "utf8"));
    contract = parseNormalizationContract(value);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if ((await stat(args.input)).size > POPULATION_READ_LIMITS.archiveBytes) throw new Error("population archive exceeds limit");
  const { expectedSha256, ...monthInput } = contract;
  const hash = createHash("sha256");
  let sourceByteLength = 0;
  for await (const chunk of createReadStream(args.input)) {
    sourceByteLength += chunk.length;
    if (sourceByteLength > POPULATION_READ_LIMITS.archiveBytes) throw new Error("population archive exceeds limit");
    hash.update(chunk);
  }
  const actualSha256 = hash.digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("input sha256 mismatch");
  const entries: EntryMetadata[] = [];
  const monthly = await aggregateMonth(readPopulationRows(args.input, (metadata) => entries.push(metadata)), monthInput);
  await writeNormalizationOutput(args["output-dir"], monthly, {
    period: contract.period, input: args.input, contract, sourceSha256: actualSha256,
    sourceByteLength, entries, status: monthly.status,
  });
  if (monthly.status === "invalid") process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
