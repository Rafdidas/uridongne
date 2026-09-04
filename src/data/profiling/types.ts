export type TextEncoding = "utf8" | "euc-kr";

export type Delimiter = "," | "\t" | "|";

export interface ArtifactEntry {
  name: string;
  byteLength: number;
  bytes: Uint8Array;
}

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
