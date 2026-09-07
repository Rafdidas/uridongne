import { describe, expect, it } from "vitest";

import type { MonthAggregation } from "./aggregate-month";
import { parseMonthResult, toMonthResult } from "./month-result";

const input = {
  period: "202602",
  asOfDate: "2026-03-01",
  sourceId: "OA-23016" as const,
  schemaVersion: "oa23016-hourly-v1",
  method: { status: "unverified" as const, version: null, evidenceIds: [] },
  registry: null,
};

const complete = (): MonthAggregation => ({
  period: "202602", status: "complete", expectedSlotsPerDong: 672,
  observedSlots: 672, errors: [], input, coverageStatus: "observed_only",
  dongs: {
    "00123456": {
      dongCode: "00123456", count: 672, sumMicros: BigInt(67200000000),
      mean: "100.000000", missingSlots: 0, status: "complete",
      firstDate: "20260201", lastDate: "20260228", missingRate: 0,
    },
  },
});

describe("population MonthResult contract", () => {
  it("converts internal aggregation to a sorted JSON-safe result", () => {
    const result = toMonthResult(complete());
    expect(result.status).toBe("valid");
    expect(result.dongs[0]).toMatchObject({
      dongCode: "00123456", expectedCount: 672, observedCount: 672,
      missingCount: 0, sumMicros: "67200000000", mean: "100.000000",
      firstDate: "20260201", lastDate: "20260228", status: "complete",
    });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(parseMonthResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it("rejects inconsistent counts, means, duplicate codes, and unknown fields", () => {
    const result = toMonthResult(complete());
    const cases = [
      { ...result, dongs: [{ ...result.dongs[0], observedCount: 0 }] },
      { ...result, dongs: [{ ...result.dongs[0], count: 1 }] },
      { ...result, dongs: [result.dongs[0], result.dongs[0]] },
      { ...result, extra: true },
    ];
    for (const value of cases) expect(() => parseMonthResult(value)).toThrow();
  });

  it("requires invalid results to contain diagnostics and no dong results", () => {
    const result = toMonthResult({ ...complete(), status: "invalid", dongs: {}, errors: ["bad row"] });
    expect(result).toMatchObject({ status: "invalid", dongs: [], errors: { counts: { source_error: 1 } } });
    expect(() => parseMonthResult({ ...result, errors: { counts: {}, samples: [] } })).toThrow();
  });
});
