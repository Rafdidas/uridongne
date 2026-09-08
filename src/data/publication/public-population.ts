export interface PublicPopulationInput {
  snapshotId: string;
  currentPeriod: string;
  current: { mean: string | null; status: "complete" | "incomplete"; methodStatus: "verified" | "unverified" };
  comparison: {
    mode: "same_month_previous_year" | "previous_month" | "unavailable";
    currentValue: string | null;
    candidateValue: string | null;
    difference: string | null;
    percent: string | null;
    reason: string | null;
    reasons: string[];
    comparisonPeriod: string | null;
    candidateFailures: Array<{ period: string; reasons: string[] }>;
  };
}

export interface PublicPopulation {
  status: "available" | "unavailable";
  snapshotId: string;
  currentPeriod: string;
  currentMean: string | null;
  comparisonMode: PublicPopulationInput["comparison"]["mode"];
  comparisonPeriod: string | null;
  previousMean: string | null;
  difference: string | null;
  percentChange: string | null;
  reasonCodes: string[];
  candidateFailures: Array<{ period: string; reasons: string[] }>;
}

export function toPublicPopulation(input: PublicPopulationInput): PublicPopulation {
  const currentAvailable = input.current.status === "complete" && input.current.methodStatus === "verified" && input.current.mean !== null;
  const reasonCodes = currentAvailable
    ? input.comparison.reasons
    : [...new Set([input.current.methodStatus === "unverified" ? "method_unverified" : "current_incomplete", ...input.comparison.reasons])];
  return {
    status: currentAvailable ? "available" : "unavailable",
    snapshotId: input.snapshotId,
    currentPeriod: input.currentPeriod,
    currentMean: currentAvailable ? input.current.mean : null,
    comparisonMode: currentAvailable ? input.comparison.mode : "unavailable",
    comparisonPeriod: currentAvailable ? input.comparison.comparisonPeriod : null,
    previousMean: currentAvailable ? input.comparison.candidateValue : null,
    difference: currentAvailable ? input.comparison.difference : null,
    percentChange: currentAvailable ? input.comparison.percent : null,
    reasonCodes,
    candidateFailures: input.comparison.candidateFailures,
  };
}
