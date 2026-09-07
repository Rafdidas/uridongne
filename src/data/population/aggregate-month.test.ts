import { describe, expect, it } from "vitest";

import { aggregatePopulation } from "./aggregate-month";
import type { LocatedRow } from "./types";
import { PopulationSourceError } from "./errors";

const row = (date: string, hour: number, dongCode: string, population: string): LocatedRow => ({
  entry: "fixture.csv",
  line: hour + 2,
  values: { 일자: date, 시간: String(hour).padStart(2, "0"), 행정동코드: dongCode, 생활인구합계: population },
});

async function* rows(values: LocatedRow[]): AsyncGenerator<LocatedRow> {
  yield* values;
}

describe("aggregatePopulation", () => {
  it("counts every error while retaining at most 20 located samples", async () => {
    const values = Array.from({ length: 25 }, (_, index) => ({ ...row("20260201", 0, "00123456", "*"), line: index + 2 }));
    values.push({ ...row("20260230", 0, "00123456", "10"), line: 27 });
    const result = await aggregatePopulation("202602", rows(values));
    expect(result.diagnostics?.counts).toEqual({ invalid_population: 25, invalid_date: 1 });
    expect(result.diagnostics?.samples).toHaveLength(20);
    expect(result.diagnostics?.samples[0]).toEqual({ code: "invalid_population", entry: "fixture.csv", line: 2 });
  });
  it("preserves counts with samples disabled", async () => {
    const result = await aggregatePopulation("202602", rows([row("20260201", 0, "00123456", "*")]), { maxErrors: 0 });
    expect(result.diagnostics).toEqual({ counts: { invalid_population: 1 }, samples: [] });
  });
  it("invalidates partial data and preserves a reader failure location", async () => {
    async function* failed() {
      yield row("20260201", 0, "00123456", "10");
      throw new PopulationSourceError("csv_structure_error", "invalid CSV", "broken.csv", 9);
    }
    const result = await aggregatePopulation("202602", failed());
    expect(result.status).toBe("invalid");
    expect(result.dongs).toEqual({});
    expect(result.diagnostics).toEqual({ counts: { csv_structure_error: 1 }, samples: [{ code: "csv_structure_error", entry: "broken.csv", line: 9 }] });
  });
  it("does not approve an empty source as complete", async () => {
    const result = await aggregatePopulation("202602", rows([]));
    expect(result.status).toBe("invalid");
    expect(result.dongs).toEqual({});
  });

  it("keeps invalid status when error sample collection is disabled", async () => {
    const result = await aggregatePopulation("202602", rows([row("20260201", 0, "00123456", "*")]), { maxErrors: 0 });
    expect(result.status).toBe("invalid");
    expect(result.dongs).toEqual({});
  });
  it("aggregates complete February coverage with exact decimal arithmetic", async () => {
    const values: LocatedRow[] = [];
    for (let day = 1; day <= 28; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) values.push(row(`202602${String(day).padStart(2, "0")}`, hour, "00123456", hour % 2 === 0 ? "100" : "200"));
    }

    const result = await aggregatePopulation("202602", rows(values));
    expect(result.status).toBe("complete");
    expect(result.dongs["00123456"]).toMatchObject({ count: 672, mean: "150.000000", missingSlots: 0 });
    expect(result.dongs["00123456"].sumMicros).toBe(BigInt(100_800_000_000));
  });

  it("marks a dong incomplete when a slot is missing", async () => {
    const result = await aggregatePopulation("202602", rows([row("20260201", 0, "00123456", "10")]));
    expect(result.status).toBe("incomplete");
    expect(result.dongs["00123456"]).toMatchObject({ status: "incomplete", mean: null, missingSlots: 671 });
  });

  it("rejects duplicate dong/date/hour slots, including numeric-looking variants", async () => {
    const result = await aggregatePopulation("202602", rows([row("20260201", 0, "00123456", "10"), row("20260201", 0, "00123456", "11")]));
    expect(result.status).toBe("invalid");
    expect(result.errors[0]).toContain("duplicate slot");
  });

  it("can require an expected administrative-dong registry", async () => {
    const result = await aggregatePopulation("202602", rows([row("20260201", 0, "00123456", "10")]), {
      expectedDongCodes: ["00123456", "00999999"],
    });
    expect(result.dongs["00999999"]).toMatchObject({ status: "incomplete", count: 0, mean: null, missingSlots: 672 });
  });
});
