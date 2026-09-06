import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";

import { POPULATION_HEADERS } from "./schema";
import { readPopulationRows } from "./read-rows";

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
      for await (const _rowValue of readPopulationRows(filePath)) {
        // Consume the iterator to trigger header validation.
      }
    }).rejects.toThrow("population header mismatch");
    await rm(directory, { recursive: true, force: true });
  });
});
