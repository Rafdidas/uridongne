import { readFile } from "node:fs/promises";

import { compareMonths, parseAreaChanges } from "../../src/data/population/compare-months";
import { readCandidateOutcome, writeComparisonOutput } from "../../src/data/population/artifact-output";
import type { MonthAggregation } from "../../src/data/population/aggregate-month";
import { parseNamedArgs } from "./cli-args";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseNamedArgs(argv[0] === "--" ? argv.slice(1) : argv, ["current-dir", "previous-year-dir", "previous-month-dir", "changes", "output-dir"]);
  const outcomes = await Promise.all([
    readCandidateOutcome(args["current-dir"]),
    readCandidateOutcome(args["previous-year-dir"]),
    readCandidateOutcome(args["previous-month-dir"]),
  ]);
  const toAggregation = (outcome: Awaited<ReturnType<typeof readCandidateOutcome>>): MonthAggregation => outcome.kind === "success" ? outcome.monthly : {
    period: outcome.period, status: "invalid", expectedSlotsPerDong: 0, observedSlots: 0, dongs: {}, errors: outcome.reasons, diagnostics: outcome.diagnostics as unknown as MonthAggregation["diagnostics"],
  };
  const [current, previousYear, previousMonth] = outcomes.map(toAggregation) as [MonthAggregation, MonthAggregation, MonthAggregation];
  const changes = parseAreaChanges(JSON.parse(await readFile(args.changes, "utf8")));
  const comparison = compareMonths(current, previousYear, previousMonth, changes);
  const output = { currentPeriod: current.period, comparisons: comparison };
  await writeComparisonOutput(args["output-dir"], output, { currentPeriod: current.period });
  if (comparison.length === 0 || comparison.every(result => result.mode === "unavailable")) process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
