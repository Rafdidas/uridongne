import { parse } from "csv-parse/sync";

import { decodeText, detectDelimiter } from "./archive";
import type { ArtifactEntry, EntryProfile } from "./types";

const NULL_MARKERS = new Set(["", "*", "\\N", "null", "NULL"]);
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

function normalizeHeaderDelimiter(text: string, delimiter: string): string {
  const lineBreakIndex = text.search(/\r?\n/);
  if (lineBreakIndex === -1) return text;

  const header = text.slice(0, lineBreakIndex);
  const headerDelimiter = detectDelimiter(header);

  if (headerDelimiter === delimiter || !header.includes(headerDelimiter)) return text;

  return `${header.replaceAll(headerDelimiter, delimiter)}${text.slice(lineBreakIndex)}`;
}

export function profileDelimited(entry: ArtifactEntry): EntryProfile {
  const decoded = decodeText(entry.bytes);
  const delimiter = detectDelimiter(decoded.text);
  const records = parse(normalizeHeaderDelimiter(decoded.text, delimiter), {
    columns: true,
    delimiter,
    record_delimiter: ["\r\n", "\n"],
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
      } else if (NUMBER_PATTERN.test(value)) {
        numericValues.push(Number(value));
      } else {
        invalidCount += 1;
      }
    }

    if (numericValues.length > 0) {
      numeric[header] = {
        min: numericValues.reduce((minimum, value) => Math.min(minimum, value)),
        max: numericValues.reduce((maximum, value) => Math.max(maximum, value)),
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
