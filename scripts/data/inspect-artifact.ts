import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { readArtifact, sha256 } from "../../src/data/profiling/archive";
import { profileArtifactEntries } from "../../src/data/profiling/artifact-invariants";
import type { ArtifactProfile, PopulationSchema, StoreSchema } from "../../src/data/profiling/types";
import { parseNamedArgs } from "./cli-args";

const args = parseNamedArgs(process.argv.slice(2), ["kind", "period", "input", "output", "schema"]);

if (args.kind !== "store" && args.kind !== "population") {
  throw new Error(`Invalid --kind: ${args.kind}`);
}

const inputBytes = await readFile(args.input);
const entries = await readArtifact(args.input);
const schemaValue: unknown = JSON.parse(args.schema);

function checkedSchema<T extends object>(value: unknown, keys: readonly (keyof T)[]): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("--schema must be a JSON object");
  }

  const record = value as Record<string, unknown>;
  const missing = keys.filter((key) => typeof record[String(key)] !== "string" || record[String(key)] === "");
  const unknown = Object.keys(record).filter((key) => !keys.includes(key as keyof T));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `Invalid --schema keys; missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}`,
    );
  }

  return record as T;
}

const profiled =
  args.kind === "store"
    ? profileArtifactEntries(
        entries,
        "store",
        checkedSchema<StoreSchema>(schemaValue, [
          "quarter",
          "dongCode",
          "industryCode",
          "totalStoreCount",
          "nonFranchiseStoreCount",
          "franchiseStoreCount",
          "openingCount",
          "closingCount",
        ]),
      )
    : profileArtifactEntries(
        entries,
        "population",
        checkedSchema<PopulationSchema>(schemaValue, ["date", "hour", "dongCode", "totalPopulation"]),
      );
const profile: ArtifactProfile = {
  sourceKind: args.kind,
  period: args.period,
  inputName: path.basename(args.input),
  byteLength: inputBytes.byteLength,
  sha256: sha256(inputBytes),
  entries: profiled.entries,
  invariants: profiled.invariants,
};

await mkdir(path.dirname(args.output), { recursive: true });
await writeFile(args.output, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
