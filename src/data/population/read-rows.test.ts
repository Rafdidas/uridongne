import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";

import { POPULATION_HEADERS } from "./schema";
import { readPopulationRows } from "./read-rows";
import iconv from "iconv-lite";

const extraDirectories: string[] = [];
async function archive(files: Record<string, Buffer>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "population-limits-"));
  extraDirectories.push(directory);
  const zip = new AdmZip();
  for (const [name, bytes] of Object.entries(files)) zip.addFile(name, bytes);
  const input = path.join(directory, "input.zip");
  zip.writeZip(input);
  return input;
}
afterEach(async () => {
  await Promise.all(extraDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});
async function consume(source: AsyncIterable<unknown>): Promise<void> {
  for await (const value of source) void value;
}

function row(delimiter: string, date: string): string {
  const values = POPULATION_HEADERS.map((header) =>
    header === "일자" ? date : header === "시간" ? "00" : header === "행정동코드" ? "00123456" : header === "생활인구합계" ? "100.125" : "*",
  );
  return values.join(delimiter);
}

function csv(delimiter: string, date: string, headerDelimiter = delimiter): string {
  return `${POPULATION_HEADERS.join(headerDelimiter)}\r\n${row(delimiter, date)}\n`;
}

describe("readPopulationRows", () => {
  it("yields early rows without parsing the entire entry and supports cancellation", async () => {
    const text = POPULATION_HEADERS.join(",") + "\n" + (row(",", "20260701") + "\n").repeat(5000) + "broken,row\n";
    const input = await archive({ "day.csv": Buffer.from(text) });
    const iterator = readPopulationRows(input);
    expect((await iterator.next()).value?.values["일자"]).toBe("20260701");
    await iterator.return(undefined);
    await expect(consume(readPopulationRows(input))).rejects.toMatchObject({ code: "csv_structure_error", line: 5002 });
  });
  it("rejects an empty ZIP", async () => {
    const input = await archive({});
    await expect(consume(readPopulationRows(input))).rejects.toThrow(/entry count/);
  });
  it("rejects non-CSV entries instead of interpreting them as data", async () => {
    const input = await archive({ "unexpected.txt": Buffer.from(csv(",", "20260701")) });
    await expect(consume(readPopulationRows(input))).rejects.toThrow(/unexpected population entry/);
  });

  it.each([
    { entryBytes: 1 }, { totalBytes: 1 }, { archiveBytes: 1 },
  ])("rejects injected byte limits before yielding observations %#", async limits => {
    const input = await archive({ "day.csv": Buffer.from(csv(",", "20260701")) });
    let observed = 0;
    await expect(async () => {
      for await (const value of readPopulationRows(input, undefined, limits)) { void value; observed++; }
    }).rejects.toThrow(/limit/);
    expect(observed).toBe(0);
  });

  it("checks the whole ZIP directory before yielding any entry", async () => {
    const first = Buffer.from(csv(",", "20260701"));
    const second = Buffer.from(csv(",", "20260702").repeat(2));
    const input = await archive({ "a.csv": first, "z.csv": second });
    let observed = 0;
    await expect(async () => {
      for await (const value of readPopulationRows(input, undefined, { entryBytes: first.length + 1 })) { void value; observed++; }
    }).rejects.toThrow(/limit/);
    expect(observed).toBe(0);
  });

  it("enforces the file count limit", async () => {
    const input = await archive({ "a.csv": Buffer.from(csv(",", "20260701")), "b.csv": Buffer.from(csv(",", "20260702")) });
    await expect(consume(readPopulationRows(input, undefined, { entryCount: 1 }))).rejects.toThrow(/entry count/);
  });

  it("reports the physical end line including blank lines and quoted newlines", async () => {
    const values = ["20260701", "00", "00123456", "100", '"one\ntwo"', ...Array(27).fill("*")];
    const input = await archive({ "day.csv": Buffer.from(POPULATION_HEADERS.join(",") + "\r\n\n" + values.join(",") + "\n") });
    const actual = [];
    for await (const value of readPopulationRows(input)) actual.push(value);
    expect(actual[0].line).toBe(4);
    expect(actual[0].values["남자 0~9세"]).toBe("one\ntwo");
  });

  it("handles quoted EUC-KR headers and semicolon data", async () => {
    const text = POPULATION_HEADERS.map(header => JSON.stringify(header)).join(",") + "\r\n" + row(";", "20260701") + "\n";
    const input = await archive({ "day.csv": iconv.encode(text, "euc-kr") });
    const actual = [];
    for await (const value of readPopulationRows(input)) actual.push(value);
    expect(actual[0].values["일자"]).toBe("20260701");
  });

  it("rejects duplicate headers with source location", async () => {
    const headers = [...POPULATION_HEADERS];
    headers[1] = "일자";
    const input = await archive({ "day.csv": Buffer.from(headers.join(",") + "\n" + row(",", "20260701")) });
    await expect(consume(readPopulationRows(input))).rejects.toMatchObject({ code: "header_mismatch", entry: "day.csv", line: 1 });
  });

  it("reports malformed records with their physical line", async () => {
    const input = await archive({ "day.csv": Buffer.from(POPULATION_HEADERS.join(",") + "\n\n20260701,00\n") });
    await expect(consume(readPopulationRows(input))).rejects.toMatchObject({ code: "csv_structure_error", entry: "day.csv", line: 3 });
  });
  it("reads a monthly CSV and daily ZIP entries into the same row contract", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uridongne-population-rows-"));
    const monthlyPath = path.join(directory, "monthly.csv");
    const zipPath = path.join(directory, "daily.zip");
    await writeFile(monthlyPath, csv(",", "20260701"), "utf8");

    const zip = new AdmZip();
    zip.addFile("day-1.csv", Buffer.from(csv(",", "20260701"), "utf8"));
    zip.addFile("day-2.csv", Buffer.from(csv(";", "20260702", ","), "utf8"));
    zip.writeZip(zipPath);

    try {
      const monthlyRows = [];
      for await (const rowValue of readPopulationRows(monthlyPath)) monthlyRows.push(rowValue);
      const zipRows = [];
      const entries: Array<{ name: string; rowCount: number }> = [];
      for await (const rowValue of readPopulationRows(zipPath, (metadata) => entries.push({ name: metadata.name, rowCount: metadata.rowCount }))) {
        zipRows.push(rowValue);
      }

      expect(monthlyRows).toHaveLength(1);
      expect(zipRows).toHaveLength(2);
      expect(zipRows.map((value) => value.values["일자"])).toEqual(["20260701", "20260702"]);
      expect(entries).toEqual([
        { name: "day-1.csv", rowCount: 1 },
        { name: "day-2.csv", rowCount: 1 },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an archive with a missing required header", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uridongne-population-rows-"));
    const filePath = path.join(directory, "broken.csv");
    await writeFile(filePath, "일자,시간,행정동코드\n20260701,00,00123456\n", "utf8");
    await expect(async () => {
      for await (const rowValue of readPopulationRows(filePath)) {
        // Consume the iterator to trigger header validation.
        void rowValue;
      }
    }).rejects.toThrow("population header mismatch");
    await rm(directory, { recursive: true, force: true });
  });
});
