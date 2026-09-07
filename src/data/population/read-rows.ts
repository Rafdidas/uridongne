import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import AdmZip from "adm-zip";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import { decodeText } from "../profiling/archive";
import { PopulationSourceError } from "./errors";
import { POPULATION_HEADERS } from "./schema";
import type { LocatedRow } from "./types";

type Delimiter = "," | ";" | "\t" | "|";
export interface EntryMetadata {
  name: string; byteLength: number; encoding: "utf8" | "euc-kr";
  delimiter: Delimiter; headerDelimiter: Delimiter; headers: string[]; rowCount: number;
}
export interface PopulationReadLimits {
  archiveBytes: number; entryBytes: number; totalBytes: number; entryCount: number;
}
export const POPULATION_READ_LIMITS: Readonly<PopulationReadLimits> = {
  archiveBytes: 256 * 1024 * 1024, entryBytes: 128 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024, entryCount: 64,
};
const RECORD_LIMIT = 64 * 1024;
const DELIMITERS: Delimiter[] = [",", ";", "\t", "|"];

// Sample only two logical records, without allocating an array of the full file's lines.
function sampleRecords(text: string, name: string) {
  const records: { text: string; start: number; end: number; line: number }[] = [];
  let start = 0, quoted = false, line = 1;
  for (let index = 0; index <= text.length; index++) {
    const character = text[index];
    if (index - start > RECORD_LIMIT) throw new PopulationSourceError("csv_structure_error", "population record exceeds limit", name, line);
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    }
    if (index === text.length || (!quoted && (character === "\r" || character === "\n"))) {
      if (index > start) records.push({ text: text.slice(start, index), start, end: index, line });
      if (records.length === 2) break;
      if (character === "\r" && text[index + 1] === "\n") index++;
      start = index + 1;
      line++;
    } else if (character === "\n") line++;
  }
  return records;
}

function fields(record: string, delimiter: Delimiter): string[] {
  const parsed = parseSync(record, { delimiter, bom: true, skip_empty_lines: true }) as string[][];
  return parsed[0] ?? [];
}
function delimiterFor(record: string): Delimiter {
  return DELIMITERS.map(delimiter => {
    try { return { delimiter, count: fields(record, delimiter).length }; }
    catch { return { delimiter, count: 0 }; }
  }).sort((a, b) => b.count - a.count)[0].delimiter;
}
function prepare(text: string, name: string) {
  const [header, sample] = sampleRecords(text, name);
  if (!header) throw new PopulationSourceError("header_mismatch", "population header mismatch", name, 1);
  const headerDelimiter = delimiterFor(header.text);
  let headers: string[];
  try { headers = fields(header.text, headerDelimiter); }
  catch { throw new PopulationSourceError("header_mismatch", "population header mismatch", name, header.line); }
  if (headers.length !== POPULATION_HEADERS.length || new Set(headers).size !== headers.length ||
    POPULATION_HEADERS.some(value => !headers.includes(value))) {
    throw new PopulationSourceError("header_mismatch", "population header mismatch", name, header.line);
  }
  const delimiter = sample ? delimiterFor(sample.text) : headerDelimiter;
  const normalized = headerDelimiter === delimiter ? text :
    text.slice(0, header.start) + headers.map(value => '"' + value.replaceAll('"', '""') + '"').join(delimiter) + text.slice(header.end);
  return { text: normalized, headers, headerDelimiter, delimiter };
}
function* chunks(text: string) {
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 16 * 1024, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    yield text.slice(start, end);
    start = end;
  }
}
async function* parseEntry(name: string, text: string, delimiter: Delimiter): AsyncGenerator<LocatedRow> {
  const source = Readable.from(chunks(text), { objectMode: false });
  const options = {
    columns: true, delimiter, info: true, record_delimiter: ["\r\n", "\n"],
    skip_empty_lines: true, relax_column_count: false, bom: true,
    max_record_size: RECORD_LIMIT, readableHighWaterMark: 16,
  };
  const parser = parse(options);
  const completed = pipeline(source, parser);
  void completed.catch(() => undefined);
  try {
    for await (const item of parser as AsyncIterable<{ record: Record<string, string>; info: { lines: number } }>) {
      yield { entry: name, line: item.info.lines, values: item.record };
    }
    await completed;
  } catch (error) {
    const lines = (error as { lines?: number }).lines;
    throw new PopulationSourceError("csv_structure_error", "invalid population CSV structure", name, lines ?? null);
  } finally {
    source.destroy();
    parser.destroy();
    await completed.catch(() => undefined);
  }
}

export async function* readPopulationRowsFromBytes(inputBytes: Buffer, inputPath: string,
  onEntry?: (metadata: EntryMetadata) => void,
  overrides: Partial<PopulationReadLimits> = {},
): AsyncGenerator<LocatedRow> {
  const limits = { ...POPULATION_READ_LIMITS, ...overrides };
  if (Object.values(limits).some(limit => !Number.isSafeInteger(limit) || limit <= 0)) throw new Error("invalid population read limits");
  try {
    if (inputBytes.byteLength > limits.archiveBytes) throw new PopulationSourceError("archive_limit", "population archive exceeds limit", inputPath);
    const zip = path.extname(inputPath).toLowerCase() === ".zip" ? new AdmZip(inputBytes) : null;
    const entries = zip ? zip.getEntries().filter(entry => !entry.isDirectory) :
      [{ entryName: path.basename(inputPath), header: { size: inputBytes.byteLength }, getData: () => inputBytes }];
    if (!entries.length || entries.length > limits.entryCount) throw new PopulationSourceError("archive_limit", "invalid population entry count", inputPath);
    let declaredTotal = 0;
    for (const entry of entries) {
      if (path.extname(entry.entryName).toLowerCase() !== ".csv") throw new PopulationSourceError("unexpected_entry", "unexpected population entry", entry.entryName);
      if (!Number.isSafeInteger(entry.header.size) || entry.header.size < 0 || entry.header.size > limits.entryBytes) {
        throw new PopulationSourceError("archive_limit", "population entry exceeds limit", entry.entryName);
      }
      declaredTotal += entry.header.size;
    }
    if (declaredTotal > limits.totalBytes) throw new PopulationSourceError("archive_limit", "population expanded bytes exceed limit", inputPath);
    let actualTotal = 0;
    for (const entry of entries) {
      const bytes = entry.getData();
      actualTotal += bytes.byteLength;
      if (bytes.byteLength > limits.entryBytes || actualTotal > limits.totalBytes) throw new PopulationSourceError("archive_limit", "population expanded bytes exceed limit", entry.entryName);
      if (bytes.byteLength !== entry.header.size) throw new PopulationSourceError("csv_structure_error", "population entry size mismatch", entry.entryName);
      const decoded = decodeText(bytes);
      const prepared = prepare(decoded.text, entry.entryName);
      let rowCount = 0;
      for await (const row of parseEntry(entry.entryName, prepared.text, prepared.delimiter)) { rowCount++; yield row; }
      onEntry?.({ name: entry.entryName, byteLength: bytes.byteLength, encoding: decoded.encoding,
        delimiter: prepared.delimiter, headerDelimiter: prepared.headerDelimiter, headers: prepared.headers, rowCount });
    }
  } catch (error) {
    if (error instanceof PopulationSourceError) throw error;
    throw new PopulationSourceError("source_read_error", "unable to read population source", inputPath);
  }
}

export async function* readPopulationRows(inputPath: string,
  onEntry?: (metadata: EntryMetadata) => void,
  overrides: Partial<PopulationReadLimits> = {},
): AsyncGenerator<LocatedRow> {
  try {
    const declaredSize = (await stat(inputPath)).size;
    const archiveLimit = overrides.archiveBytes ?? POPULATION_READ_LIMITS.archiveBytes;
    if (!Number.isSafeInteger(archiveLimit) || archiveLimit <= 0) throw new Error("invalid population read limits");
    if (declaredSize > archiveLimit) throw new PopulationSourceError("archive_limit", "population archive exceeds limit", inputPath);
    const inputBytes = await readFile(inputPath);
    if (inputBytes.byteLength > archiveLimit) throw new PopulationSourceError("archive_limit", "population archive exceeds limit", inputPath);
    yield* readPopulationRowsFromBytes(inputBytes, inputPath, onEntry, overrides);
  } catch (error) {
    if (error instanceof PopulationSourceError) throw error;
    throw new PopulationSourceError("source_read_error", "unable to read population source", inputPath);
  }
}
