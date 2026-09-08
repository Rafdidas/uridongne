import { describe, expect, it } from "vitest";

import { toPublicPopulation } from "./public-population";

describe("toPublicPopulation", () => {
  it("does not expose a current value when the method evidence is unverified", () => {
    const result = toPublicPopulation({
      snapshotId: "snapshot-202607", currentPeriod: "202607", current: { mean: "150.000000", status: "complete", methodStatus: "unverified" },
      comparison: { mode: "unavailable", currentValue: "150.000000", candidateValue: null, difference: null, percent: null, reason: "method_unverified", reasons: ["method_unverified"], comparisonPeriod: null, candidateFailures: [] },
    });

    expect(result).toEqual({ status: "unavailable", currentPeriod: "202607", currentMean: null, comparisonMode: "unavailable", comparisonPeriod: null, previousMean: null, difference: null, percentChange: null, reasonCodes: ["method_unverified"], candidateFailures: [], snapshotId: "snapshot-202607" });
  });

  it("returns verified current and comparison values as decimal strings", () => {
    const result = toPublicPopulation({
      snapshotId: "snapshot-202607", currentPeriod: "202607", current: { mean: "150.000000", status: "complete", methodStatus: "verified" },
      comparison: { mode: "same_month_previous_year", currentValue: "150.000000", candidateValue: "100.000000", difference: "50.000000", percent: "50.000000", reason: null, reasons: [], comparisonPeriod: "202507", candidateFailures: [] },
    });

    expect(result).toMatchObject({ status: "available", currentMean: "150.000000", comparisonMode: "same_month_previous_year", comparisonPeriod: "202507", previousMean: "100.000000", difference: "50.000000", percentChange: "50.000000", reasonCodes: [] });
  });
});
