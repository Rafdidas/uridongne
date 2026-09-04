export type TextEncoding = "utf8" | "euc-kr";

export type Delimiter = "," | ";" | "\t" | "|";

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
  invariants?: StoreInvariantProfile | PopulationInvariantProfile;
}

export interface StoreSchema {
  quarter: string;
  dongCode: string;
  industryCode: string;
  totalStoreCount: string;
  nonFranchiseStoreCount: string;
  franchiseStoreCount: string;
  openingCount: string;
  closingCount: string;
}

export interface PopulationSchema {
  date: string;
  hour: string;
  dongCode: string;
  totalPopulation: string;
}

export interface StoreInvariantProfile {
  duplicateKeyCount: number;
  totalMismatchCount: number;
  negativeCount: number;
  nonIntegerCount: number;
  quarterValues: string[];
  dongCodeLengths: Record<string, number>;
  dongCodeValues: string[];
}

export interface PopulationInvariantProfile {
  duplicateKeyCount: number;
  negativeCount: number;
  nonFiniteCount: number;
  dateRange: { min: string; max: string };
  hourValues: number[];
  dongCodeLengths: Record<string, number>;
  dongCodeValues: string[];
}

export type ComparisonMode = "same_month_previous_year" | "previous_month" | "unavailable";

export interface ProfileDifference {
  path: string;
  current: string;
  candidate: string;
}

export interface PopulationCompatibility {
  comparisonMode: ComparisonMode;
  comparisonPeriod: string | null;
  compatible: boolean;
  fallbackReason: "previous_year_schema_mismatch" | "previous_month_schema_mismatch" | null;
  differences: ProfileDifference[];
}
