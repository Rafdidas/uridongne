import { describe, expect, it } from "vitest";

import { compareMonths } from "./compare-months";
import type { MonthAggregation } from "./aggregate-month";

const month = (period: string, mean: string, status: "complete" | "incomplete" = "complete", methodStatus: "verified" | "unverified" = "verified"): MonthAggregation => ({
  period,
  status,
  expectedSlotsPerDong: 1,
  observedSlots: status === "complete" ? 1 : 0,
  errors: [],
  methodId: "official-hourly-mean-v1",
  methodStatus,
  dongs: {
    "00123456": {
      dongCode: "00123456",
      count: status === "complete" ? 1 : 0,
      sumMicros: BigInt(status === "complete" ? Number(mean) * 1_000_000 : 0),
      mean: status === "complete" ? mean : null,
      missingSlots: status === "complete" ? 0 : 1,
      status,
    },
  },
});

describe("compareMonths", () => {
  it("prefers the complete same-month previous-year candidate", () => {
    const [comparison] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"));
    expect(comparison).toMatchObject({ mode: "same_month_previous_year", difference: "50.000000", percent: "50.000000" });
  });

  it("falls back to the previous month when the prior year is incomplete", () => {
    const [comparison] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000", "incomplete"), month("202606", "120.000000"));
    expect(comparison).toMatchObject({ mode: "previous_month", difference: "30.000000", percent: "25.000000" });
    expect(comparison.reasons).toContain("candidate_incomplete");
  });

  it("does not substitute another period when a code is absent", () => {
    const previousYear = month("202507", "100.000000");
    previousYear.dongs = {};
    const [comparison] = compareMonths(month("202607", "150.000000"), previousYear, month("202606", "120.000000"));
    expect(comparison).toMatchObject({ mode: "unavailable", reason: "administrative_area_unverified" });
  });

  it("reports zero previous values without a percentage", () => {
    const previousYear = month("202507", "0.000000");
    const [comparison] = compareMonths(month("202607", "150.000000"), previousYear, month("202606", "120.000000"));
    expect(comparison.percent).toBeNull();
    expect(comparison.reasons).toContain("previous_value_zero");
  });
});
