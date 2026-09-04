import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { compareProfiles } from "../../src/data/profiling/compatibility";
import type { ArtifactProfile } from "../../src/data/profiling/types";
import { parseNamedArgs } from "./cli-args";

const args = parseNamedArgs(process.argv.slice(2), ["current", "previous-year", "previous-month", "output"]);

async function readProfile(filePath: string): Promise<ArtifactProfile> {
  return JSON.parse(await readFile(filePath, "utf8")) as ArtifactProfile;
}

const [current, previousYear, previousMonth] = await Promise.all([
  readProfile(args.current),
  readProfile(args["previous-year"]),
  readProfile(args["previous-month"]),
]);
const comparison = compareProfiles(current, previousYear, previousMonth);

await mkdir(path.dirname(args.output), { recursive: true });
await writeFile(args.output, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

if (comparison.comparisonMode === "unavailable") {
  process.exitCode = 2;
}
