export interface LocatedRow {
  entry: string;
  line: number;
  values: Record<string, string>;
}

export interface Observation {
  date: string;
  hour: number;
  dongCode: string;
  populationMicros: bigint;
}

export interface MethodEvidence {
  status: "verified" | "unverified";
  version: string | null;
  evidenceIds: string[];
}

export interface ExpectedDong {
  code: string;
  validFrom: string;
  validToExclusive: string | null;
}

export interface MonthInput {
  period: string;
  asOfDate: string;
  sourceId: "OA-23016";
  schemaVersion: string;
  method: MethodEvidence;
  registry: { version: string; evidenceIds: string[]; dongs: ExpectedDong[] } | null;
}

export interface NormalizationContract extends MonthInput {
  expectedSha256: string;
}
