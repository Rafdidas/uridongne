import { readFile } from "node:fs/promises";

import { compareMonths, type AreaChange } from "../../src/data/population/compare-months";
import { readMonthlyOutput, writeComparisonOutput } from "../../src/data/population/artifact-output";
import { parseNamedArgs } from "./cli-args";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseNamedArgs(argv[0] === "--" ? argv.slice(1) : argv, ["current-dir", "previous-year-dir", "previous-month-dir", "changes", "output-dir"]);
  const [current, previousYear, previousMonth] = await Promise.all([
    readMonthlyOutput(args["current-dir"]),
    readMonthlyOutput(args["previous-year-dir"]),
    readMonthlyOutput(args["previous-month-dir"]),
  ]);
  const changes = JSON.parse(await readFile(args.changes, "utf8")) as AreaChange[];
  const comparison = compareMonths(current, previousYear, previousMonth, changes);
  const output = { currentPeriod: current.period, comparisons: comparison };
  await writeComparisonOutput(args["output-dir"], output, { currentPeriod: current.period });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
