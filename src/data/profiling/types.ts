export type TextEncoding = "utf8" | "euc-kr";

export type Delimiter = "," | "\t" | "|";

export interface ArtifactEntry {
  name: string;
  byteLength: number;
  bytes: Uint8Array;
}
