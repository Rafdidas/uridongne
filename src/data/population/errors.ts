export class PopulationSourceError extends Error {
  constructor(public readonly code: string, message: string,
    public readonly entry: string, public readonly line: number | null = null) {
    super(message);
    this.name = "PopulationSourceError";
  }
}

export interface PopulationDiagnostics {
  counts: Record<string, number>;
  samples: { code: string; entry: string; line: number | null }[];
}
