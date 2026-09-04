import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..", "..");

describe("inspect-artifact CLI", () => {
  it("writes a deterministic metadata profile without emitting source rows beyond the sample limit", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uridongne-inspect-"));
    const outputPath = path.join(directory, "profile.json");
    const fixturePath = path.join(projectRoot, "src", "data", "profiling", "__fixtures__", "store-sample.csv");
    const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const scriptPath = path.join(scriptsDirectory, "inspect-artifact.ts");

    try {
      await execFileAsync(process.execPath, [tsxCli, scriptPath, "--kind", "store", "--period", "2025", "--input", fixturePath, "--output", outputPath]);
      const profile = JSON.parse(await readFile(outputPath, "utf8"));

      expect(profile).toMatchObject({
        sourceKind: "store",
        period: "2025",
        inputName: "store-sample.csv",
      });
      expect(profile.entries).toHaveLength(1);
      expect(profile.entries[0].firstRows).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
