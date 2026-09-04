import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import AdmZip from "adm-zip";
import iconv from "iconv-lite";

import type { ArtifactEntry, Delimiter, TextEncoding } from "./types";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodeText(bytes: Uint8Array): { encoding: TextEncoding; text: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    return { encoding: "utf8", text };
  } catch {
    return { encoding: "euc-kr", text: iconv.decode(Buffer.from(bytes), "euc-kr") };
  }
}

export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates: Delimiter[] = [",", "\t", "|"];

  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ",";
}

export async function readArtifact(inputPath: string): Promise<ArtifactEntry[]> {
  const bytes = await readFile(inputPath);

  if (path.extname(inputPath).toLowerCase() !== ".zip") {
    return [{ name: path.basename(inputPath), byteLength: bytes.byteLength, bytes }];
  }

  return new AdmZip(bytes)
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => {
      const entryBytes = entry.getData();

      return {
        name: entry.entryName,
        byteLength: entryBytes.byteLength,
        bytes: entryBytes,
      };
    });
}
