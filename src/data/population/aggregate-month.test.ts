import { describe, expect, it } from "vitest";

import { aggregatePopulation } from "./aggregate-month";
import type { LocatedRow } from "./types";

const row = (date: string, hour: number, dongCode: string, population: string): LocatedRow => ({
  entry: "fixture.csv",
  line: hour + 2,
  values: { 일자: date, 시간: String(hour).padStart(2, "0"), 행정동코드: dongCode, 생활인구합계: population },
});

async function* rows(values: LocatedRow[]): AsyncGenerator<LocatedRow> {
  yield* values;
}

describe("aggregatePopulation", () => {
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
