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
