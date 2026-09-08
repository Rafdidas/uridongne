import { describe, expect, it } from "vitest";

import { populationOverviewResponse, type PopulationOverviewStore } from "./population-overview-endpoint";

const available = {
  status: "available" as const, snapshotId: "snapshot-202607", currentPeriod: "202607", currentMean: "150.000000",
  comparisonMode: "same_month_previous_year" as const, comparisonPeriod: "202507", previousMean: "100.000000", difference: "50.000000", percentChange: "50.000000", reasonCodes: [], candidateFailures: [],
};
function store(values: Partial<PopulationOverviewStore>): PopulationOverviewStore {
  return { hasPublishedSnapshot: () => true, hasPublishedDong: () => true, overview: () => available, ...values };
}

describe("population overview HTTP contract", () => {
  it("returns 400 for a malformed dong code", () => {
    expect(populationOverviewResponse(store({}), "production", "bad").status).toBe(400);
  });

  it("returns 503 when the channel has no public snapshot", () => {
    expect(populationOverviewResponse(store({ hasPublishedSnapshot: () => false }), "production", "00123456")).toMatchObject({ status: 503, body: { error: "data_not_ready" } });
  });

  it("returns 404 only when a code is absent from the public registry", () => {
    expect(populationOverviewResponse(store({ hasPublishedDong: () => false }), "production", "00123456")).toMatchObject({ status: 404, body: { error: "dong_not_found" } });
  });

  it("returns a registered dong with unavailable population data", () => {
    expect(populationOverviewResponse(store({ overview: () => undefined }), "production", "00123456")).toMatchObject({ status: 200, body: { population: { status: "unavailable", currentMean: null, reasonCodes: ["population_not_available"] } } });
  });
});
