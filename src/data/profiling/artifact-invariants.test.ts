import { describe, expect, it } from "vitest";

import { profileArtifactEntries } from "./artifact-invariants";
import type { ArtifactEntry, PopulationSchema, StoreSchema } from "./types";

function entry(name: string, csv: string): ArtifactEntry {
  const bytes = Buffer.from(csv, "utf8");
  return { name, byteLength: bytes.byteLength, bytes };
}

const storeSchema: StoreSchema = {
  quarter: "quarter",
  dongCode: "dong",
  industryCode: "industry",
  totalStoreCount: "total",
  nonFranchiseStoreCount: "ordinary",
  franchiseStoreCount: "franchise",
  openingCount: "openings",
  closingCount: "closings",
};

const populationSchema: PopulationSchema = {
  date: "date",
  hour: "hour",
  dongCode: "dong",
  totalPopulation: "population",
};

describe("profileArtifactEntries", () => {
  it("measures store invariants across every source row", () => {
    const result = profileArtifactEntries(
      [
        entry(
          "store.csv",
          [
            "quarter,dong,industry,total,ordinary,franchise,openings,closings",
            "20251,00123456,A,12,10,2,1,0",
            "20251,00123456,A,12,10,2,1,0",
            "20252,12345678,B,8,5,2,-1,1.5",
          ].join("\n"),
        ),
      ],
      "store",
      storeSchema,
    );

    expect(result.invariants).toEqual({
      duplicateKeyCount: 1,
      totalMismatchCount: 1,
      negativeCount: 1,
      nonIntegerCount: 1,
      quarterValues: ["20251", "20252"],
      dongCodeLengths: { "8": 3 },
      dongCodeValues: ["00123456", "12345678"],
    });
  });

  it("measures population invariants across archive entry boundaries", () => {
    const result = profileArtifactEntries(
      [
        entry(
          "day-1.csv",
          [
            "date,hour,dong,population",
            "20260701,0,00123456,100.5",
            "20260701,1,12345678,-2",
          ].join("\n"),
        ),
        entry(
          "day-2.csv",
          [
            "date,hour,dong,population",
            "20260701,0,00123456,100.5",
            "20260702,23,12345678,NaN",
          ].join("\n"),
        ),
      ],
      "population",
      populationSchema,
    );

    expect(result.invariants).toEqual({
      duplicateKeyCount: 1,
      negativeCount: 1,
      nonFiniteCount: 1,
      dateRange: { min: "20260701", max: "20260702" },
      hourValues: [0, 1, 23],
      dongCodeLengths: { "8": 4 },
      dongCodeValues: ["00123456", "12345678"],
    });
  });

  it("rejects a schema whose columns are absent from an entry", () => {
    expect(() =>
      profileArtifactEntries(
        [entry("broken.csv", "date,hour,dong\n20260701,0,00123456\n")],
        "population",
        populationSchema,
      ),
    ).toThrow("missing required columns: population");
  });
});
