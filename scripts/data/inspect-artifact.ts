import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { readArtifact, sha256 } from "../../src/data/profiling/archive";
import { profileDelimited } from "../../src/data/profiling/profile-delimited";
import type { ArtifactProfile } from "../../src/data/profiling/types";
import { parseNamedArgs } from "./cli-args";

const args = parseNamedArgs(process.argv.slice(2), ["kind", "period", "input", "output"]);

if (args.kind !== "store" && args.kind !== "population") {
  throw new Error(`Invalid --kind: ${args.kind}`);
}

const inputBytes = await readFile(args.input);
const entries = await readArtifact(args.input);
const profile: ArtifactProfile = {
  sourceKind: args.kind,
  period: args.period,
  inputName: path.basename(args.input),
  byteLength: inputBytes.byteLength,
  sha256: sha256(inputBytes),
  entries: entries.map(profileDelimited),
};

await mkdir(path.dirname(args.output), { recursive: true });
await writeFile(args.output, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
