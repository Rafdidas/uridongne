import type { PublicPopulation } from "./public-population";

export interface PopulationOverviewStore {
  hasPublishedSnapshot(channel: string): boolean;
  hasPublishedDong(channel: string, dongCode: string): boolean;
  overview(channel: string, dongCode: string): PublicPopulation | undefined;
}

export interface PopulationOverviewResponse {
  status: 200 | 400 | 404 | 503;
  body: Record<string, unknown>;
}

export function populationOverviewResponse(store: PopulationOverviewStore, channel: string, dongCode: string): PopulationOverviewResponse {
  if (!/^\d{8}$/.test(dongCode)) return { status: 400, body: { error: "invalid_dong_code" } };
  if (!store.hasPublishedSnapshot(channel)) return { status: 503, body: { error: "data_not_ready" } };
  if (!store.hasPublishedDong(channel, dongCode)) return { status: 404, body: { error: "dong_not_found" } };
  const population = store.overview(channel, dongCode) ?? {
    status: "unavailable", snapshotId: null, currentPeriod: null, currentMean: null, comparisonMode: "unavailable", comparisonPeriod: null,
    previousMean: null, difference: null, percentChange: null, reasonCodes: ["population_not_available"], candidateFailures: [],
  };
  return { status: 200, body: { apiVersion: 1, population } };
}
