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
  it("keeps complete dongs comparable when another dong has missing slots", () => {
    const current = month("202607", "150.000000");
    const prior = month("202507", "100.000000");
    for (const value of [current, prior]) {
      value.status = "incomplete";
      value.dongs["00999999"] = { dongCode: "00999999", count: 0, sumMicros: BigInt(0), mean: null, missingSlots: 1, status: "incomplete" };
    }
    const result = compareMonths(current, prior, month("202606", "120.000000"));
    expect(result[0].mode).toBe("same_month_previous_year");
    expect(result[1].mode).toBe("unavailable");
  });

  it("allows fallback from an invalid source with no dongs", () => {
    const prior = { ...month("202507", "100.000000"), status: "invalid" as const, dongs: {}, errors: ["duplicate slot"] };
    const [result] = compareMonths(month("202607", "150.000000"), prior, month("202606", "120.000000"));
    expect(result.mode).toBe("previous_month");
    expect(result.reasons).toContain("invalid_source");
  });

  it("ignores boundary changes before the comparison period", () => {
    const [result] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [
      { dongCode: "00123456", effectivePeriod: "202401" },
    ]);
    expect(result.mode).toBe("same_month_previous_year");
  });

  it("retains both candidate failures", () => {
    const prior = month("202507", "100.000000");
    prior.methodId = "different";
    const [result] = compareMonths(month("202607", "150.000000"), prior, month("202606", "120.000000", "incomplete"));
    expect(result.reasons).toEqual(["method_mismatch", "candidate_incomplete"]);
  });

  it("blocks fallback when the year candidate crosses a boundary change", () => {
    const [result] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [
      { dongCode: "00123456", effectivePeriod: "202601" },
    ]);
    expect(result.reason).toBe("administrative_area_changed");
  });
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
