import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { aggregatePopulation } from "../../src/data/population/aggregate-month";
import { writeNormalizationOutput } from "../../src/data/population/artifact-output";
import { readPopulationRows, type EntryMetadata } from "../../src/data/population/read-rows";
import { parseNamedArgs } from "./cli-args";

interface Contract {
  period: string;
  methodId?: string;
  methodStatus?: "verified" | "unverified";
  expectedSha256?: string;
  expectedDongCodes?: string[];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseNamedArgs(argv[0] === "--" ? argv.slice(1) : argv, ["input", "contract", "output-dir"]);
  const contract = JSON.parse(await readFile(args.contract, "utf8")) as Contract;
  const input = await readFile(args.input);
  if (contract.expectedSha256 && createHash("sha256").update(input).digest("hex") !== contract.expectedSha256) throw new Error("input sha256 mismatch");
  const entries: EntryMetadata[] = [];
  const monthly = await aggregatePopulation(contract.period, readPopulationRows(args.input, (metadata) => entries.push(metadata)), { expectedDongCodes: contract.expectedDongCodes });
  monthly.methodId = contract.methodId ?? "official-hourly-mean-v1";
  monthly.methodStatus = contract.methodStatus ?? "unverified";
  await writeNormalizationOutput(args["output-dir"], monthly, { period: contract.period, input: args.input, entries, status: monthly.status });
  if (monthly.status === "invalid") process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
