import { describe, expect, it } from "vitest";
import { aggregateMonth } from "./aggregate-month";
import type { ExpectedDong, LocatedRow, MonthInput } from "./types";

const input = (dongs?: ExpectedDong[]): MonthInput => ({
  period: "202602", asOfDate: "2026-03-01", sourceId: "OA-23016", schemaVersion: "oa23016-hourly-v1",
  method: { status: "unverified", version: null, evidenceIds: [] },
  registry: dongs ? { version: "fixture", evidenceIds: ["fixture-registry"], dongs } : null,
});
const registered = (code: string): ExpectedDong => ({ code, validFrom: "2020-01-01", validToExclusive: null });
async function* observations(code = "00123456", first = 1, last = 28): AsyncGenerator<LocatedRow> {
  for (let day = first; day <= last; day++) {
    for (let hour = 0; hour < 24; hour++) {
      yield { entry: "fixture.csv", line: (day - 1) * 24 + hour + 2, values: {
        일자: `202602${String(day).padStart(2, "0")}`, 시간: String(hour), 행정동코드: code, 생활인구합계: "150",
      } };
    }
  }
}

describe("contract-aware monthly aggregation", () => {
  it("labels coverage observed_only without an official registry", async () => {
    const result = await aggregateMonth(observations(), input());
    expect(result).toMatchObject({ status: "complete", coverageStatus: "observed_only", input: input() });
    expect(result.dongs["00123456"]).toMatchObject({ mean: "150.000000", firstDate: "20260201", lastDate: "20260228", missingRate: 0 });
  });
  it("reports a registry-only missing dong with null dates", async () => {
    const result = await aggregateMonth(observations(), input([registered("00123456"), registered("00999999")]));
    expect(result.coverageStatus).toBe("expected_registry");
    expect(result.dongs["00999999"]).toMatchObject({ count: 0, missingSlots: 672, missingRate: 1, mean: null, firstDate: null, lastDate: null });
  });
  it("invalidates observations outside the registry", async () => {
    const result = await aggregateMonth(observations(), input([registered("00999999")]));
    expect(result.status).toBe("invalid");
    expect(result.dongs).toEqual({});
    expect(result.errors[0]).toContain("unregistered dong");
  });
  it("counts a mid-month creation against the full month", async () => {
    const result = await aggregateMonth(observations("00123456", 15), input([{ ...registered("00123456"), validFrom: "2026-02-15" }]));
    expect(result.dongs["00123456"]).toMatchObject({ status: "incomplete", count: 336, missingSlots: 336, missingRate: 0.5, mean: null });
  });
  it("rejects observations on or after the exclusive retirement date", async () => {
    const result = await aggregateMonth(observations(), input([{ ...registered("00123456"), validToExclusive: "2026-02-28" }]));
    expect(result.status).toBe("invalid");
    expect(result.errors[0]).toContain("outside dong validity");
  });
  it("does not count a dong retired before this month as missing", async () => {
    const result = await aggregateMonth(observations(), input([
      registered("00123456"), { ...registered("00999999"), validToExclusive: "2026-02-01" },
    ]));
    expect(Object.keys(result.dongs)).toEqual(["00123456"]);
    expect(result.status).toBe("complete");
  });
  it("validates the period before consuming any input rows", async () => {
    let consumed = false;
    async function* source() { consumed = true; yield* observations(); }
    await expect(aggregateMonth(source(), { ...input(), asOfDate: "2026-02-28" })).rejects.toThrow();
    expect(consumed).toBe(false);
  });
});
