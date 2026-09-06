import { readFile } from "node:fs/promises";
import path from "node:path";

import AdmZip from "adm-zip";
import { parse } from "csv-parse";

import { decodeText, detectDelimiter } from "../profiling/archive";
import { POPULATION_HEADERS } from "./schema";
import type { LocatedRow } from "./types";

export interface EntryMetadata {
  name: string;
  byteLength: number;
  encoding: "utf8" | "euc-kr";
  delimiter: "," | ";" | "\t" | "|";
  headers: string[];
  rowCount: number;
}

const LIMITS = { archiveBytes: 256 * 1024 * 1024, entryBytes: 128 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024, entryCount: 64 };

function normalizeHeaderDelimiter(text: string, delimiter: string): string {
  const lineBreakIndex = text.search(/\r?\n/);
  if (lineBreakIndex === -1) return text;
  const header = text.slice(0, lineBreakIndex);
  const candidates = [",", ";", "\t", "|"];
  const headerDelimiter = candidates
    .map((candidate) => ({ candidate, count: header.split(candidate).length - 1 }))
    .sort((left, right) => right.count - left.count)[0]?.candidate ?? delimiter;
  if (headerDelimiter === delimiter) return text;
  return `${header.replaceAll(headerDelimiter, delimiter)}${text.slice(lineBreakIndex)}`;
}

function validateHeaders(headers: string[]): void {
  const duplicate = headers.find((header, index) => headers.indexOf(header) !== index);
  const expected = new Set<string>(POPULATION_HEADERS);
  const actual = new Set(headers);
  const missing = POPULATION_HEADERS.filter((header) => !actual.has(header));
  const extra = headers.filter((header) => !expected.has(header));
  if (duplicate || missing.length > 0 || extra.length > 0 || headers.length !== POPULATION_HEADERS.length) {
    throw new Error(`population header mismatch${duplicate ? `: duplicate ${duplicate}` : ""}`);
  }
}

async function* parseEntry(name: string, bytes: Uint8Array): AsyncGenerator<LocatedRow> {
  if (bytes.byteLength > LIMITS.entryBytes) throw new Error(`population entry exceeds limit: ${name}`);
  const decoded = decodeText(bytes);
  const delimiter = detectDelimiter(decoded.text);
  const text = normalizeHeaderDelimiter(decoded.text, delimiter);
  let line = 1;
  const parser = parse(text, {
    columns: (headers: string[]) => {
      validateHeaders(headers);
      return headers;
    },
    delimiter,
    record_delimiter: ["\r\n", "\n"],
    skip_empty_lines: true,
    relax_column_count: false,
    bom: true,
  });
  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    line += 1;
    yield { entry: name, line, values: record };
  }
}

export async function* readPopulationRows(
  inputPath: string,
  onEntry?: (metadata: EntryMetadata) => void,
): AsyncGenerator<LocatedRow> {
  const inputBytes = await readFile(inputPath);
  if (inputBytes.byteLength > LIMITS.archiveBytes) throw new Error("population archive exceeds limit");

  const zip = path.extname(inputPath).toLowerCase() === ".zip" ? new AdmZip(inputBytes) : null;
  const zipEntries = zip?.getEntries().filter((entry) => !entry.isDirectory) ?? [];
  if (zip && (zipEntries.length === 0 || zipEntries.length > LIMITS.entryCount)) throw new Error("invalid population entry count");
  let totalBytes = 0;
  const entries = zip ? zipEntries : [{ entryName: path.basename(inputPath), getData: () => inputBytes }];
  for (const entry of entries) {
    const bytes = entry.getData();
    totalBytes += bytes.byteLength;
    if (totalBytes > LIMITS.totalBytes) throw new Error("population expanded bytes exceed limit");
    const decoded = decodeText(bytes);
    const delimiter = detectDelimiter(decoded.text);
    const text = normalizeHeaderDelimiter(decoded.text, delimiter);
    const headerLine = text.split(/\r?\n/, 1)[0] ?? "";
    const headers = headerLine.split(delimiter).map((header) => header.replace(/^\uFEFF/, ""));
    validateHeaders(headers);
    let rowCount = 0;
    for await (const row of parseEntry(entry.entryName, bytes)) {
      rowCount += 1;
      yield row;
    }
    onEntry?.({ name: entry.entryName, byteLength: bytes.byteLength, encoding: decoded.encoding, delimiter, headers, rowCount });
  }
}
