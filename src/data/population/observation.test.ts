import { describe, expect, it } from "vitest";

import { parseObservation } from "./observation";
import type { LocatedRow } from "./types";

function row(values: Record<string, string>): LocatedRow {
  return { entry: "fixture.csv", line: 2, values };
}

describe("parseObservation", () => {
  it("normalizes a valid row while preserving the dong code", () => {
    expect(
      parseObservation(
        row({ 일자: "20260701", 시간: "00", 행정동코드: "00123456     ", 생활인구합계: "100.125" }),
        "202607",
      ),
    ).toEqual({ date: "20260701", hour: 0, dongCode: "00123456", populationMicros: BigInt(100125000) });
  });

  it("rejects invalid dates, hours, codes, and periods", () => {
    const base = { 일자: "20260701", 시간: "0", 행정동코드: "00123456", 생활인구합계: "1" };
    for (const [field, value] of [
      ["일자", "20260230"],
      ["시간", "24"],
      ["시간", "1.5"],
      ["행정동코드", "1234567"],
      ["행정동코드", "0012 456"],
      ["일자", "20260801"],
    ] as const) {
      expect(() => parseObservation(row({ ...base, [field]: value }), "202607")).toThrow();
    }
  });
});
