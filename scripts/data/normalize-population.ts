import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { aggregateMonth } from "../../src/data/population/aggregate-month";
import { parseNormalizationContract } from "../../src/data/population/contract";
import type { NormalizationContract } from "../../src/data/population/types";
import { writeNormalizationOutput } from "../../src/data/population/artifact-output";
import { readPopulationRows, type EntryMetadata } from "../../src/data/population/read-rows";
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
  const input = await readFile(args.input);
  const { expectedSha256, ...monthInput } = contract;
  const actualSha256 = createHash("sha256").update(input).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("input sha256 mismatch");
  const entries: EntryMetadata[] = [];
  const monthly = await aggregateMonth(readPopulationRows(args.input, (metadata) => entries.push(metadata)), monthInput);
  await writeNormalizationOutput(args["output-dir"], monthly, {
    period: contract.period, input: args.input, contract, sourceSha256: actualSha256,
    sourceByteLength: input.byteLength, entries, status: monthly.status,
  });
  if (monthly.status === "invalid") process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
