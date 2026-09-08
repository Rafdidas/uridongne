import { describe, expect, it } from "vitest";

import { compareMonths, parseAreaChanges } from "./compare-months";
import type { MonthAggregation } from "./aggregate-month";

const month = (period: string, mean: string, status: "complete" | "incomplete" = "complete", methodStatus: "verified" | "unverified" = "verified"): MonthAggregation => ({
  period,
  status,
  expectedSlotsPerDong: 1,
  observedSlots: status === "complete" ? 1 : 0,
  errors: [],
  methodId: "official-hourly-mean-v1",
  methodStatus,
  input: {
    period, asOfDate: "2026-09-07", sourceId: "OA-23016", schemaVersion: "oa23016-hourly-v1", registry: null,
    method: methodStatus === "verified"
      ? { status: "verified", version: "official-hourly-mean-v1", evidenceIds: ["fixture-method-document"] }
      : { status: "unverified", version: null, evidenceIds: [] },
  },
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
  it("parses date-based area changes with evidence", () => {
    expect(parseAreaChanges([{ code: "00123456", effectiveDate: "2026-01-15", evidenceId: "official-change-1", kind: "boundary_change" }])).toEqual([
      { code: "00123456", effectiveDate: "2026-01-15", evidenceId: "official-change-1", kind: "boundary_change" },
    ]);
    expect(() => parseAreaChanges([{ code: "00123456", effectiveDate: "2026-02-30", evidenceId: "x", kind: "created" }])).toThrow();
    expect(() => parseAreaChanges([{ code: "00123456", effectiveDate: "2026-01-15", evidenceId: "x", kind: "unknown" }])).toThrow();
  });
  it("does not trust legacy verified flags without the evidence contract", () => {
    const current = month("202607", "150.000000");
    delete current.input;
    const [result] = compareMonths(current, month("202507", "100.000000"), month("202606", "120.000000"));
    expect(result.reason).toBe("method_unverified");
    expect(result.difference).toBeNull();
  });
  it("rejects empty evidence on a claimed verified method", () => {
    const current = month("202607", "150.000000");
    current.input!.method.evidenceIds = [];
    const [result] = compareMonths(current, month("202507", "100.000000"), month("202606", "120.000000"));
    expect(result.reason).toBe("method_unverified");
  });
  it("uses the validated method version instead of legacy duplicate fields", () => {
    const prior = month("202507", "100.000000");
    prior.input!.method.version = "different";
    const [result] = compareMonths(month("202607", "150.000000"), prior, month("202606", "120.000000"));
    expect(result.mode).toBe("previous_month");
    expect(result.reasons).toContain("method_mismatch");
  });
  it("falls back only to a candidate with the same semantic schema", () => {
    const prior = month("202507", "100.000000");
    prior.input!.schemaVersion = "different";
    const [result] = compareMonths(month("202607", "150.000000"), prior, month("202606", "120.000000"));
    expect(result.mode).toBe("previous_month");
    expect(result.reasons).toContain("schema_mismatch");
  });
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
      { code: "00123456", effectiveDate: "2024-01-15", evidenceId: "fixture", kind: "boundary_change" },
    ]);
    expect(result.mode).toBe("same_month_previous_year");
  });

  it("retains both candidate failures", () => {
    const prior = month("202507", "100.000000");
    prior.input!.method.version = "different";
    const [result] = compareMonths(month("202607", "150.000000"), prior, month("202606", "120.000000", "incomplete"));
    expect(result.reasons).toEqual(["method_mismatch", "candidate_incomplete"]);
  });

  it("blocks fallback when the year candidate crosses a boundary change", () => {
    const [result] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [
      { code: "00123456", effectiveDate: "2026-01-15", evidenceId: "fixture", kind: "boundary_change" },
    ]);
    expect(result.reason).toBe("administrative_area_changed");
  });
  it("allows a change on the first day of the prior-year month", () => {
    const [result] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [
      { code: "00123456", effectiveDate: "2025-07-01", evidenceId: "fixture", kind: "boundary_change" },
    ]);
    expect(result.mode).toBe("same_month_previous_year");
  });
  it("blocks a change after the prior-year month starts and records the candidate failure", () => {
    const [result] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [
      { code: "00123456", effectiveDate: "2025-07-15", evidenceId: "fixture", kind: "boundary_change" },
    ]);
    expect(result).toMatchObject({ mode: "unavailable", reason: "administrative_area_changed", candidateFailures: [{ period: "202507", reasons: ["administrative_area_changed"] }] });
  });
  it("blocks a change on the current month end but ignores the next day", () => {
    const blocked = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [
      { code: "00123456", effectiveDate: "2026-07-31", evidenceId: "fixture", kind: "boundary_change" },
    ]);
    const allowed = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [
      { code: "00123456", effectiveDate: "2026-08-01", evidenceId: "fixture", kind: "boundary_change" },
    ]);
    expect(blocked[0].mode).toBe("unavailable");
    expect(allowed[0].mode).toBe("same_month_previous_year");
  });
  it("prefers the complete same-month previous-year candidate", () => {
    const [comparison] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"));
    expect(comparison).toMatchObject({ mode: "same_month_previous_year", difference: "50.000000", percent: "50.000000" });
  });

  it("falls back to the previous month when the prior year is incomplete", () => {
    const [comparison] = compareMonths(month("202607", "150.000000"), month("202507", "100.000000", "incomplete"), month("202606", "120.000000"));
    expect(comparison).toMatchObject({ mode: "previous_month", difference: "30.000000", percent: "25.000000" });
    expect(comparison.reasons).toContain("candidate_incomplete");
    expect(comparison).toMatchObject({ comparisonMode: "previous_month", comparisonPeriod: "202606", fallbackReason: "candidate_incomplete", codeMatchBasis: "same_code" });
    expect(comparison.candidateFailures).toEqual([{ period: "202507", reasons: ["candidate_incomplete"] }]);
  });

  it("validates changes even when compareMonths is called directly", () => {
    expect(() => compareMonths(month("202607", "150.000000"), month("202507", "100.000000"), month("202606", "120.000000"), [{ code: "bad" } as never])).toThrow(/area change/);
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
