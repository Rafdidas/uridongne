# Seoul Source Sample Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inspect real Seoul store and OA-23016 population artifacts, prove whether year-over-year comparison is valid, and record the exact schemas and data-quality findings needed for the production pipeline.

**Architecture:** Build a development-only TypeScript profiler that reads ZIP/CSV artifacts without persisting raw records to Git, emits deterministic JSON metadata, and turns the selected official samples into a reviewed Markdown validation report. This plan does not create D1/R2 resources or production parsers; those plans depend on the verified headers, encoding, null tokens, row counts, and period compatibility produced here.

**Tech Stack:** Node.js 24.12.0, TypeScript 6.0.2, Vitest 4.1.11, tsx 4.23.13, adm-zip 0.6.0, @types/adm-zip 0.5.8, csv-parse 7.0.2, iconv-lite 0.7.3, pnpm 10.30.3

**Spec:** `docs/superpowers/specs/2026-09-04-data-pipeline-and-map-design.md`

## Global Constraints

- Preserve official raw downloads under ignored `data/raw/`; never commit multi-megabyte source archives.
- Commit only deterministic profiles, tiny synthetic fixtures, documentation, and code.
- Store no Seoul API key, Cloudflare credential, account identifier, or secret in files, commands, profiles, test output, or Git history.
- Treat administrative-dong codes as strings so leading zeroes cannot be lost.
- Store comparison defaults to latest published quarter versus the same quarter one year earlier and requires five consecutive quarters for trends.
- Population comparison defaults to the latest complete month versus the same month one year earlier; use the previous month only when OA-23016 method, field-version, or completeness checks fail and record the fallback reason.
- Do not label summed hourly population as unique visitors. The intended metric remains the arithmetic mean of valid hourly observations.
- Do not create Cloudflare R2/D1 resources, deploy Workers, or push GitHub changes in this plan.
- Preserve the existing uncommitted pastel-theme changes and do not include them in task commits.

---

## File Structure

- `src/data/profiling/types.ts`: shared artifact, entry, column, and compatibility report types.
- `src/data/profiling/archive.ts`: SHA-256, ZIP entry extraction, encoding detection, and delimiter detection.
- `src/data/profiling/archive.test.ts`: archive and text-detection tests using synthetic fixtures.
- `src/data/profiling/profile-delimited.ts`: streaming-style row profiling for decoded delimited text.
- `src/data/profiling/profile-delimited.test.ts`: header, row-count, null-token, and numeric-stat tests.
- `src/data/profiling/compatibility.ts`: compares two artifact profiles and returns explicit compatible/incompatible reasons.
- `src/data/profiling/compatibility.test.ts`: year-over-year schema compatibility tests.
- `scripts/data/inspect-artifact.ts`: CLI that produces deterministic JSON profiles.
- `scripts/data/compare-profiles.ts`: CLI that compares current, previous-year, and previous-month profiles.
- `data/profiles/store-2025.json`: generated metadata for the 2025 store archive.
- `data/profiles/store-2024.json`: generated metadata for the 2024 store archive.
- `data/profiles/population-202607.json`: generated metadata for the latest confirmed complete OA-23016 month.
- `data/profiles/population-202507.json`: generated metadata for the same month one year earlier.
- `data/profiles/population-202606.json`: generated metadata for the immediately preceding month.
- `data/profiles/population-comparison.json`: deterministic comparison result and fallback reason, if any.
- `docs/data/2026-09-04-source-sample-validation.md`: human-readable evidence and production-parser decisions.
- `package.json`: profiling commands and development-only packages.
- `.gitignore`: ignored raw and extraction workspace directories.
- `README.md`: data-profile commands and raw-input handling.
- `handoff.md`: sample periods, findings, commands, and next design/implementation boundary.

---

### Task 1: Artifact and ZIP inspection primitives

**Files:**
- Create: `src/data/profiling/types.ts`
- Create: `src/data/profiling/archive.ts`
- Create: `src/data/profiling/archive.test.ts`
- Create: `src/data/profiling/__fixtures__/store-sample.csv`
- Create: `src/data/profiling/__fixtures__/population-sample.csv`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `sha256(bytes: Uint8Array): string`
- Produces: `decodeText(bytes: Uint8Array): { encoding: "utf8" | "euc-kr"; text: string }`
- Produces: `detectDelimiter(text: string): "," | "\t" | "|"`
- Produces: `readArtifact(inputPath: string): Promise<ArtifactEntry[]>`
- Produces: `ArtifactEntry = { name: string; byteLength: number; bytes: Uint8Array }`
- Consumes: Node `crypto`, `fs/promises`, `path`; `adm-zip`; `iconv-lite`

- [x] **Step 1: Add synthetic fixtures with known encodings and delimiters**

Create UTF-8 fixture content:

```csv
STDR_YYQU_CD,ADSTRD_CD,ADSTRD_CD_NM,SVC_INDUTY_CD,SIMILR_INDUTY_STOR_CO,STOR_CO,FRC_STOR_CO
20251,11440660,서교동,CS100010,12,10,2
```

Create the population fixture as UTF-8 first; the test will convert it to EUC-KR bytes in memory:

```csv
기준일ID,시간대구분,행정동코드,총생활인구수
20260701,0,11440660,12345.5
20260701,1,11440660,12401.0
```

- [x] **Step 2: Write failing primitive tests**

```ts
import { readFile } from "node:fs/promises";
import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { decodeText, detectDelimiter, sha256 } from "./archive";

describe("artifact inspection primitives", () => {
  it("returns a stable lowercase SHA-256 digest", () => {
    expect(sha256(new TextEncoder().encode("uridongne"))).toBe(
      "af75f93b67536d57f99eae15a6fb04ffbc41e73a356f7383a137b145b695f11a",
    );
  });

  it("detects UTF-8 CSV", async () => {
    const bytes = await readFile(new URL("./__fixtures__/store-sample.csv", import.meta.url));
    const decoded = decodeText(bytes);
    expect(decoded.encoding).toBe("utf8");
    expect(detectDelimiter(decoded.text)).toBe(",");
  });

  it("falls back to EUC-KR for Korean text that is not valid UTF-8", () => {
    const bytes = iconv.encode("행정동코드|총생활인구수\n11440660|12345.5", "euc-kr");
    const decoded = decodeText(bytes);
    expect(decoded).toEqual({
      encoding: "euc-kr",
      text: "행정동코드|총생활인구수\n11440660|12345.5",
    });
    expect(detectDelimiter(decoded.text)).toBe("|");
  });
});
```

- [x] **Step 3: Run the test and verify RED**

Run: `pnpm test -- src/data/profiling/archive.test.ts`

Expected: FAIL because `./archive` does not exist.

- [x] **Step 4: Install exact development dependencies**

Run:

```powershell
pnpm add -D --save-exact tsx@4.23.13 adm-zip@0.6.0 @types/adm-zip@0.5.8 csv-parse@7.0.2 iconv-lite@0.7.3
```

Expected: `package.json` and `pnpm-lock.yaml` contain the exact versions above.

- [x] **Step 5: Implement types and primitives**

```ts
// src/data/profiling/types.ts
export type TextEncoding = "utf8" | "euc-kr";
export type Delimiter = "," | "\t" | "|";

export interface ArtifactEntry {
  name: string;
  byteLength: number;
  bytes: Uint8Array;
}
```

```ts
// src/data/profiling/archive.ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import type { ArtifactEntry, Delimiter, TextEncoding } from "./types";

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodeText(bytes: Uint8Array): { encoding: TextEncoding; text: string } {
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  try {
    return { encoding: "utf8", text: utf8.decode(bytes).replace(/^\uFEFF/, "") };
  } catch {
    return { encoding: "euc-kr", text: iconv.decode(Buffer.from(bytes), "euc-kr") };
  }
}

export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates: Delimiter[] = [",", "\t", "|"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

export async function readArtifact(inputPath: string): Promise<ArtifactEntry[]> {
  const bytes = await readFile(inputPath);
  if (path.extname(inputPath).toLowerCase() !== ".zip") {
    return [{ name: path.basename(inputPath), byteLength: bytes.byteLength, bytes }];
  }
  return new AdmZip(bytes).getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => {
      const entryBytes = entry.getData();
      return { name: entry.entryName, byteLength: entryBytes.byteLength, bytes: entryBytes };
    });
}
```

- [x] **Step 6: Run focused and full tests**

Run: `pnpm test -- src/data/profiling/archive.test.ts`

Expected: PASS, 3 tests.

Run: `pnpm test`

Expected: all existing and new tests pass.

- [x] **Step 7: Commit Task 1 files only**

```powershell
git add package.json pnpm-lock.yaml src/data/profiling/types.ts src/data/profiling/archive.ts src/data/profiling/archive.test.ts src/data/profiling/__fixtures__/store-sample.csv src/data/profiling/__fixtures__/population-sample.csv
git commit -m "feat: add Seoul artifact inspection primitives"
```

---

### Task 2: Deterministic delimited-file profiler and CLI

**Files:**
- Create: `src/data/profiling/profile-delimited.ts`
- Create: `src/data/profiling/profile-delimited.test.ts`
- Create: `scripts/data/cli-args.ts`
- Create: `scripts/data/inspect-artifact.ts`
- Modify: `src/data/profiling/types.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `readArtifact`, `decodeText`, `detectDelimiter`, `sha256`
- Produces: `profileDelimited(entry: ArtifactEntry): EntryProfile`
- Produces: `ArtifactProfile = { sourceKind, period, inputName, byteLength, sha256, entries }`
- Produces: `parseNamedArgs(argv: string[], required: readonly string[]): Record<string, string>`
- CLI: `pnpm data:inspect -- --kind <store|population> --period <YYYY|YYYYMM> --input <path> --output <path>`

- [x] **Step 1: Write the failing profile test**

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { profileDelimited } from "./profile-delimited";

it("profiles headers, row counts, null tokens, and numeric ranges", async () => {
  const bytes = await readFile(new URL("./__fixtures__/store-sample.csv", import.meta.url));
  const profile = profileDelimited({ name: "store-sample.csv", byteLength: bytes.length, bytes });
  expect(profile.headers).toEqual([
    "STDR_YYQU_CD", "ADSTRD_CD", "ADSTRD_CD_NM", "SVC_INDUTY_CD",
    "SIMILR_INDUTY_STOR_CO", "STOR_CO", "FRC_STOR_CO",
  ]);
  expect(profile.rowCount).toBe(1);
  expect(profile.numeric.SIMILR_INDUTY_STOR_CO).toMatchObject({ min: 12, max: 12, invalidCount: 0 });
  expect(profile.nullTokens).toEqual({});
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `pnpm test -- src/data/profiling/profile-delimited.test.ts`

Expected: FAIL because `profile-delimited.ts` does not exist.

- [x] **Step 3: Add profile types**

```ts
export interface NumericProfile {
  min: number;
  max: number;
  invalidCount: number;
}

export interface EntryProfile {
  name: string;
  byteLength: number;
  encoding: TextEncoding;
  delimiter: Delimiter;
  headers: string[];
  rowCount: number;
  nullTokens: Record<string, number>;
  numeric: Record<string, NumericProfile>;
  firstRows: Record<string, string>[];
}

export interface ArtifactProfile {
  sourceKind: "store" | "population";
  period: string;
  inputName: string;
  byteLength: number;
  sha256: string;
  entries: EntryProfile[];
}
```

- [x] **Step 4: Implement `profileDelimited`**

Use `csv-parse/sync` with `columns: true`, `skip_empty_lines: true`, `relax_column_count: false`, and the detected delimiter. Count exact null markers `""`, `"*"`, `"\\N"`, `"null"`, and `"NULL"` under keys formatted as `header=token`. Record numeric ranges for columns containing at least one numeric value and count non-null, non-numeric values in `invalidCount`. Keep at most the first five rows in `firstRows`; do not copy all raw rows into profiles.

```ts
import { parse } from "csv-parse/sync";
import { decodeText, detectDelimiter } from "./archive";
import type { ArtifactEntry, EntryProfile } from "./types";

const NULL_MARKERS = new Set(["", "*", "\\N", "null", "NULL"]);

export function profileDelimited(entry: ArtifactEntry): EntryProfile {
  const decoded = decodeText(entry.bytes);
  const delimiter = detectDelimiter(decoded.text);
  const records = parse(decoded.text, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    relax_column_count: false,
    bom: true,
  }) as Record<string, string>[];
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const nullTokens: Record<string, number> = {};
  const numeric: EntryProfile["numeric"] = {};

  for (const header of headers) {
    const numericValues: number[] = [];
    let invalidCount = 0;
    for (const record of records) {
      const value = record[header] ?? "";
      if (NULL_MARKERS.has(value)) {
        const key = `${header}=${value}`;
        nullTokens[key] = (nullTokens[key] ?? 0) + 1;
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        numericValues.push(Number(value));
      } else {
        invalidCount += 1;
      }
    }
    if (numericValues.length > 0) {
      numeric[header] = {
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        invalidCount,
      };
    }
  }

  return {
    name: entry.name,
    byteLength: entry.byteLength,
    encoding: decoded.encoding,
    delimiter,
    headers,
    rowCount: records.length,
    nullTokens,
    numeric,
    firstRows: records.slice(0, 5),
  };
}
```

- [x] **Step 5: Implement the inspection CLI**

The CLI must reject missing or repeated arguments, reject `kind` values other than `store` and `population`, create only the parent directory of `--output`, and write JSON with two-space indentation plus a final newline. It must never print `process.env`.

```ts
// scripts/data/cli-args.ts
export function parseNamedArgs(argv: string[], required: readonly string[]) {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value pairs, received: ${argv.join(" ")}`);
    }
    const name = flag.slice(2);
    if (values[name] !== undefined) throw new Error(`Repeated argument: --${name}`);
    values[name] = value;
  }
  for (const name of required) {
    if (values[name] === undefined) throw new Error(`Missing argument: --${name}`);
  }
  const unknown = Object.keys(values).filter((name) => !required.includes(name));
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  return values;
}
```

```ts
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
```

Add to `package.json`:

```json
"data:inspect": "tsx scripts/data/inspect-artifact.ts"
```

- [x] **Step 6: Verify GREEN and CLI determinism**

Run: `pnpm test -- src/data/profiling/profile-delimited.test.ts`

Expected: PASS.

Run the fixture twice to two temporary paths and compare hashes:

```powershell
pnpm data:inspect -- --kind store --period 2025 --input src/data/profiling/__fixtures__/store-sample.csv --output data/work/profile-a.json
pnpm data:inspect -- --kind store --period 2025 --input src/data/profiling/__fixtures__/store-sample.csv --output data/work/profile-b.json
Get-FileHash -Algorithm SHA256 data/work/profile-a.json
Get-FileHash -Algorithm SHA256 data/work/profile-b.json
```

Expected: both hashes are identical.

- [x] **Step 7: Commit Task 2 files only**

```powershell
git add package.json src/data/profiling/types.ts src/data/profiling/profile-delimited.ts src/data/profiling/profile-delimited.test.ts scripts/data/cli-args.ts scripts/data/inspect-artifact.ts
git commit -m "feat: add deterministic Seoul source profiler"
```

---

### Task 3: Profile compatibility and comparison fallback

**Files:**
- Create: `src/data/profiling/compatibility.ts`
- Create: `src/data/profiling/compatibility.test.ts`
- Create: `scripts/data/compare-profiles.ts`
- Modify: `src/data/profiling/types.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `compareProfiles(current, previousYear, previousMonth): PopulationCompatibility`
- Produces: `PopulationCompatibility = { comparisonMode, comparisonPeriod, compatible, fallbackReason, differences }`
- CLI: `pnpm data:compare -- --current <profile> --previous-year <profile> --previous-month <profile> --output <path>`

- [x] **Step 1: Write failing comparison tests**

```ts
import type { ArtifactProfile } from "./types";

const HEADERS = ["기준일ID", "시간대구분", "행정동코드", "총생활인구수"];

function profile(period: string, headers: string[]): ArtifactProfile {
  return {
    sourceKind: "population",
    period,
    inputName: `${period}.zip`,
    byteLength: 10,
    sha256: "0".repeat(64),
    entries: [{
      name: `${period}.csv`,
      byteLength: 10,
      encoding: "utf8",
      delimiter: ",",
      headers,
      rowCount: 1,
      nullTokens: {},
      numeric: {},
      firstRows: [],
    }],
  };
}

it("chooses the previous year when headers and encodings match", () => {
  const result = compareProfiles(profile("202607", HEADERS), profile("202507", HEADERS), profile("202606", HEADERS));
  expect(result).toMatchObject({
    comparisonMode: "same_month_previous_year",
    comparisonPeriod: "202507",
    compatible: true,
    fallbackReason: null,
  });
});

it("falls back to the previous month when the previous-year schema differs", () => {
  const result = compareProfiles(
    profile("202607", HEADERS),
    profile("202507", [...HEADERS, "LEGACY_FIELD"]),
    profile("202606", HEADERS),
  );
  expect(result).toMatchObject({
    comparisonMode: "previous_month",
    comparisonPeriod: "202606",
    compatible: true,
    fallbackReason: "previous_year_schema_mismatch",
  });
});

it("returns unavailable when neither comparison profile matches", () => {
  const result = compareProfiles(
    profile("202607", HEADERS),
    profile("202507", ["OLD_FIELD"]),
    profile("202606", ["OTHER_FIELD"]),
  );
  expect(result).toMatchObject({ comparisonMode: "unavailable", compatible: false });
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `pnpm test -- src/data/profiling/compatibility.test.ts`

Expected: FAIL because `compatibility.ts` does not exist.

- [x] **Step 3: Implement compatibility rules**

Compare the sorted list of archive entry basenames, each entry's source-order headers, detected encoding, and delimiter. Do not compare hashes or row counts for schema compatibility. Return every difference as `{ path, current, candidate }`; use the previous-year profile only when no differences exist, otherwise test the previous-month profile.

```ts
export type ComparisonMode = "same_month_previous_year" | "previous_month" | "unavailable";

export interface PopulationCompatibility {
  comparisonMode: ComparisonMode;
  comparisonPeriod: string | null;
  compatible: boolean;
  fallbackReason: "previous_year_schema_mismatch" | "previous_month_schema_mismatch" | null;
  differences: ProfileDifference[];
}

export interface ProfileDifference {
  path: string;
  current: string;
  candidate: string;
}
```

```ts
import path from "node:path";
import type {
  ArtifactProfile,
  PopulationCompatibility,
  ProfileDifference,
} from "./types";

function schemaDifferences(current: ArtifactProfile, candidate: ArtifactProfile) {
  const differences: ProfileDifference[] = [];
  const currentEntries = [...current.entries].sort((a, b) =>
    path.basename(a.name).localeCompare(path.basename(b.name)),
  );
  const candidateEntries = [...candidate.entries].sort((a, b) =>
    path.basename(a.name).localeCompare(path.basename(b.name)),
  );
  const count = Math.max(currentEntries.length, candidateEntries.length);

  for (let index = 0; index < count; index += 1) {
    const left = currentEntries[index];
    const right = candidateEntries[index];
    const prefix = `entries[${index}]`;
    const comparisons: Array<[string, unknown, unknown]> = [
      ["name", left && path.basename(left.name), right && path.basename(right.name)],
      ["encoding", left?.encoding, right?.encoding],
      ["delimiter", left?.delimiter, right?.delimiter],
      ["headers", left?.headers, right?.headers],
    ];
    for (const [field, currentValue, candidateValue] of comparisons) {
      const currentText = JSON.stringify(currentValue ?? null);
      const candidateText = JSON.stringify(candidateValue ?? null);
      if (currentText !== candidateText) {
        differences.push({ path: `${prefix}.${field}`, current: currentText, candidate: candidateText });
      }
    }
  }
  return differences;
}

export function compareProfiles(
  current: ArtifactProfile,
  previousYear: ArtifactProfile,
  previousMonth: ArtifactProfile,
): PopulationCompatibility {
  const previousYearDifferences = schemaDifferences(current, previousYear);
  if (previousYearDifferences.length === 0) {
    return {
      comparisonMode: "same_month_previous_year",
      comparisonPeriod: previousYear.period,
      compatible: true,
      fallbackReason: null,
      differences: [],
    };
  }

  const previousMonthDifferences = schemaDifferences(current, previousMonth);
  if (previousMonthDifferences.length === 0) {
    return {
      comparisonMode: "previous_month",
      comparisonPeriod: previousMonth.period,
      compatible: true,
      fallbackReason: "previous_year_schema_mismatch",
      differences: previousYearDifferences,
    };
  }

  return {
    comparisonMode: "unavailable",
    comparisonPeriod: null,
    compatible: false,
    fallbackReason: "previous_month_schema_mismatch",
    differences: [...previousYearDifferences, ...previousMonthDifferences],
  };
}
```

- [x] **Step 4: Implement comparison CLI and script**

Add to `package.json`:

```json
"data:compare": "tsx scripts/data/compare-profiles.ts"
```

The CLI uses `parseNamedArgs(argv, ["current", "previous-year", "previous-month", "output"])`, reads three JSON profiles, calls `compareProfiles`, and writes deterministic JSON. It exits with code 2 only when `comparisonMode` is `unavailable`; a valid previous-month fallback exits 0 while preserving `fallbackReason`.

- [x] **Step 5: Verify focused and full tests**

Run: `pnpm test -- src/data/profiling/compatibility.test.ts`

Expected: PASS, 3 tests.

Run: `pnpm test`

Expected: all tests pass.

- [x] **Step 6: Commit Task 3 files only**

```powershell
git add package.json src/data/profiling/types.ts src/data/profiling/compatibility.ts src/data/profiling/compatibility.test.ts scripts/data/compare-profiles.ts
git commit -m "feat: compare Seoul population source profiles"
```

---

### Task 4: Acquire and profile official artifacts

**Files:**
- Modify: `.gitignore`
- Create locally, never commit: `data/raw/store/서울시 상권분석서비스(점포-행정동)_2025년.zip`
- Create locally, never commit: `data/raw/store/서울시 상권분석서비스(점포-행정동)_2024년.zip`
- Create locally, never commit: `data/raw/population/250_LOCAL_RESD_ADMDONG_202607.zip`
- Create locally, never commit: `data/raw/population/250_LOCAL_RESD_ADMDONG_202507.zip`
- Create locally, never commit: `data/raw/population/250_LOCAL_RESD_ADMDONG_202606.zip`
- Create: `data/profiles/store-2025.json`
- Create: `data/profiles/store-2024.json`
- Create: `data/profiles/population-202607.json`
- Create: `data/profiles/population-202507.json`
- Create: `data/profiles/population-202606.json`
- Create: `data/profiles/population-comparison.json`

**Interfaces:**
- Consumes official store files from `https://data.seoul.go.kr/dataList/OA-22172/S/1/datasetView.do`
- Consumes official population files from `https://data.seoul.go.kr/dataList/OA-23016/S/1/datasetView.do`
- Produces committed profiles containing metadata and at most five source rows per archive entry

- [x] **Step 1: Ignore raw and temporary data**

Append exactly:

```gitignore
data/raw/
data/work/
```

Run: `git check-ignore data/raw/store/example.zip data/work/example.json`

Expected: both paths are printed.

- [ ] **Step 2: Download the five named official archives**

Use the official dataset download controls and save each file under the exact local paths above. If the site requires login or an API key, pause for the user to complete authentication; never automate credential entry or copy a key into the repository.

Verify:

```powershell
Get-ChildItem -LiteralPath data/raw/store,data/raw/population | Select-Object Name,Length
```

Expected: all five filenames exist with non-zero lengths. Compare displayed sizes with the official pages and record any mismatch before profiling.

- [x] **Step 3: Generate store profiles**

```powershell
pnpm data:inspect -- --kind store --period 2025 --input "data/raw/store/서울시 상권분석서비스(점포-행정동)_2025년.zip" --output data/profiles/store-2025.json
pnpm data:inspect -- --kind store --period 2024 --input "data/raw/store/서울시 상권분석서비스(점포-행정동)_2024년.zip" --output data/profiles/store-2024.json
```

Expected: both profiles contain the official fields `STDR_YYQU_CD`, `ADSTRD_CD`, `ADSTRD_CD_NM`, `SVC_INDUTY_CD`, `SVC_INDUTY_CD_NM`, `SIMILR_INDUTY_STOR_CO`, `STOR_CO`, `FRC_STOR_CO`, `OPBIZ_RT`, `OPBIZ_STOR_CO`, `CLSBIZ_RT`, and `CLSBIZ_STOR_CO`. If an official header differs, record the exact header and stop before designing the production parser.

- [ ] **Step 4: Generate population profiles and compatibility result**

```powershell
pnpm data:inspect -- --kind population --period 202607 --input data/raw/population/250_LOCAL_RESD_ADMDONG_202607.zip --output data/profiles/population-202607.json
pnpm data:inspect -- --kind population --period 202507 --input data/raw/population/250_LOCAL_RESD_ADMDONG_202507.zip --output data/profiles/population-202507.json
pnpm data:inspect -- --kind population --period 202606 --input data/raw/population/250_LOCAL_RESD_ADMDONG_202606.zip --output data/profiles/population-202606.json
pnpm data:compare -- --current data/profiles/population-202607.json --previous-year data/profiles/population-202507.json --previous-month data/profiles/population-202606.json --output data/profiles/population-comparison.json
```

Expected: comparison selects `same_month_previous_year` when the profiles match. If it selects `previous_month` or `unavailable`, preserve the generated reason and do not alter the output manually.

- [ ] **Step 5: Check profiles for accidental secrets and raw-data excess**

Run:

```powershell
rg -n "SEOUL_OPEN_DATA|API_KEY|CLOUDFLARE|account_id|token" data/profiles
Get-ChildItem -LiteralPath data/profiles | Select-Object Name,Length
```

Expected: the search returns no matches. Each profile contains at most five raw rows per entry and remains small enough for code review; if any profile exceeds 2 MB, remove high-cardinality samples from the profiler implementation, regenerate, and rerun tests.

- [ ] **Step 6: Commit ignored-path rule and deterministic profiles**

```powershell
git add .gitignore data/profiles
git commit -m "data: profile official Seoul source samples"
```

Before committing, run `git status --short` and confirm no file under `data/raw/` appears.

---

### Task 5: Write the evidence report and update project state

**Files:**
- Create: `docs/data/2026-09-04-source-sample-validation.md`
- Modify: `docs/superpowers/specs/2026-09-04-data-pipeline-and-map-design.md`
- Modify: `README.md`
- Modify: `handoff.md`

**Interfaces:**
- Consumes: the six committed JSON profiles from Task 4
- Produces: explicit production-parser requirements and a go/no-go decision for the D1 pipeline plan

- [ ] **Step 1: Write the report from measured profile values**

The report must contain these sections and fill them only from generated profiles:

```markdown
# 서울시 원본 표본 검증 결과

## 검증한 원본
| 데이터 | 공식 ID | 기준기간 | 파일명 | 바이트 | SHA-256 |

## 파일 구조
| 데이터 | 압축 내부 파일 | 인코딩 | 구분자 | 헤더 수 | 행 수 |

## 상권 불변식
- 전체 점포 수와 일반+프랜차이즈 합계의 불일치 건수
- 중복 `분기+행정동+업종` 키 건수
- 음수·비정수 건수
- 실제 분기 범위와 5개 연속 분기 가능 여부

## 생활인구 호환성
- 202607 ↔ 202507 필드·인코딩·구분자 차이
- 202607 ↔ 202606 필드·인코딩·구분자 차이
- 선택된 comparisonMode와 fallbackReason
- 날짜·시간·행정동·총생활인구 필드의 실제 이름
- 월별 관측 수와 발견된 결측 표기

## 행정동 코드
- 실제 자료형과 길이
- 두 데이터셋에서 공통·불일치 코드 수
- 선행 0 보존 여부

## 결정
- production 파서 입력 계약
- 전년 동월 비교 가능 여부
- D1 스키마 계획 진행 가능 여부
```

- [ ] **Step 2: Add measured invariant checks before the report is accepted**

Use a one-off script under `scripts/data/validate-profile-findings.ts` only if the JSON profiles contain enough first-row information for the check. If full-row checks require raw records, extend `profileDelimited` with aggregate counters rather than committing raw rows. The committed profile must include these counters:

```ts
interface StoreInvariantProfile {
  duplicateKeyCount: number;
  totalMismatchCount: number;
  negativeCount: number;
  nonIntegerCount: number;
  quarterValues: string[];
  dongCodeLengths: Record<string, number>;
}

interface PopulationInvariantProfile {
  duplicateKeyCount: number;
  negativeCount: number;
  nonFiniteCount: number;
  dateRange: { min: string; max: string };
  hourValues: number[];
  dongCodeLengths: Record<string, number>;
}
```

Add failing tests for each aggregate counter before extending the profiler, verify RED, implement the smallest source-kind-specific aggregation, then verify GREEN. Do not infer column names: take the exact names recorded in the Task 4 report and pass them as a checked `--schema` JSON argument to the CLI.

- [ ] **Step 3: Reconcile the design spec with evidence**

Update only statements disproved or made precise by the report. Preserve the approved behavior:

- default `same_month_previous_year`
- fallback `previous_month` only on method, schema, or completeness mismatch
- explicit `fallbackReason`
- no unique-visitor claim
- store total-count invariant

If the evidence cannot prove year-over-year compatibility, mark the D1 pipeline plan blocked and do not silently change the product behavior.

- [ ] **Step 4: Update README and handoff**

Add these commands to README:

```bash
pnpm data:inspect -- --kind population --period YYYYMM --input <local-official-file> --output <profile.json>
pnpm data:compare -- --current <profile> --previous-year <profile> --previous-month <profile> --output <comparison.json>
```

State that raw files are local/ignored and that profiles contain public sample metadata only. In `handoff.md`, record exact source periods, measured hashes, commands, results, unresolved anomalies, and the next plan boundary. Never paste raw records or keys into either document.

- [ ] **Step 5: Run final verification**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Expected: all commands exit 0; status contains only the intended report/spec/README/handoff changes plus the pre-existing pastel-theme changes.

- [ ] **Step 6: Commit the evidence and documentation**

```powershell
git add docs/data/2026-09-04-source-sample-validation.md docs/superpowers/specs/2026-09-04-data-pipeline-and-map-design.md README.md handoff.md
git commit -m "docs: record Seoul source sample validation"
```

Do not push. Report whether the next independently testable plan is unblocked: D1 schema and normalized aggregation when source compatibility passes, or source-adaptation work when it fails.
