import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { PublicationConflictError, SnapshotRepository } from "./snapshot-repository";
import type { MonthAggregation } from "../population/aggregate-month";
import { populationOverviewResponse } from "./population-overview-endpoint";

const databases: Database.Database[] = [];
function repository() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  databases.push(database);
  return new SnapshotRepository(database);
}
function monthly(): MonthAggregation {
  return {
    period: "202607", status: "complete", expectedSlotsPerDong: 744, observedSlots: 744, errors: [], coverageStatus: "observed_only",
    input: { period: "202607", asOfDate: "2026-09-07", sourceId: "OA-23016", schemaVersion: "oa23016-hourly-v1", method: { status: "verified", version: "fixture", evidenceIds: ["fixture-method-document"] }, registry: null },
    dongs: { "00123456": { dongCode: "00123456", count: 744, sumMicros: BigInt("999999999999999999"), mean: "1344086021505376.342742", missingSlots: 0, status: "complete", firstDate: "20260701", lastDate: "20260731", missingRate: 0 } },
  };
}
function versionInput(id: string, period: string, mean = "100.000000") {
  const value = monthly();
  value.period = period;
  value.input = { ...value.input!, period };
  const dong = value.dongs["00123456"];
  dong.mean = mean;
  dong.sumMicros = BigInt(Math.round(Number(mean) * 1_000_000)) * BigInt(dong.count);
  const marker = id === "version-current" ? "a" : id === "version-year" ? "b" : "c";
  return { id, artifactId: `source-${id}`, sourceSha256: marker.repeat(64), sourceByteLength: 100, contractHash: "d".repeat(64), processorVersion: "normalizer-v2", outputHash: marker.repeat(64), monthly: value };
}
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("SnapshotRepository", () => {
  it("publishes a validated eligible snapshot with a generation-bound event", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-a", contentHash: "a".repeat(64), publicationEligible: true });
    store.validateSnapshot("snapshot-a", "b".repeat(64));

    expect(store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" })).toEqual({ snapshotId: "snapshot-a", generation: 1 });
    expect(store.channel("production")).toEqual({ snapshotId: "snapshot-a", generation: 1 });
  });

  it("rejects a stale writer without changing the published pointer", () => {
    const store = repository();
    store.migrate();
    for (const id of ["snapshot-a", "snapshot-b"]) {
      store.createSnapshot({ id, contentHash: id === "snapshot-a" ? "a".repeat(64) : "b".repeat(64), publicationEligible: true });
      store.validateSnapshot(id, "c".repeat(64));
    }
    store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" });

    expect(() => store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-b", operationId: "operation-b", reason: "stale" })).toThrow(PublicationConflictError);
    expect(store.channel("production")).toEqual({ snapshotId: "snapshot-a", generation: 1 });
  });

  it("does not publish a validated snapshot that lacks public evidence", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-private", contentHash: "a".repeat(64), publicationEligible: false });
    store.validateSnapshot("snapshot-private", "b".repeat(64));

    expect(() => store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-private", operationId: "operation-private", reason: "missing evidence" })).toThrow(/eligible/);
    expect(store.channel("production")).toEqual({ snapshotId: null, generation: 0 });
  });

  it("returns the same completed publication for an idempotent operation retry", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-a", contentHash: "a".repeat(64), publicationEligible: true });
    store.validateSnapshot("snapshot-a", "b".repeat(64));
    const request = { channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" };

    store.publish(request);
    expect(store.publish(request)).toEqual({ snapshotId: "snapshot-a", generation: 1 });
  });

  it("rejects an operation retry whose expected generation changed", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-a", contentHash: "a".repeat(64), publicationEligible: true });
    store.validateSnapshot("snapshot-a", "b".repeat(64));
    store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" });

    expect(() => store.publish({ channel: "production", expectedGeneration: 1, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" })).toThrow(PublicationConflictError);
  });

  it("stores a ready population version with an exact integer sum", () => {
    const store = repository();
    store.migrate();

    store.ingestPopulationVersion({ id: "population-v1", artifactId: "source-v1", sourceSha256: "a".repeat(64), sourceByteLength: 100, contractHash: "b".repeat(64), processorVersion: "normalizer-v2", outputHash: "c".repeat(64), monthly: monthly() });

    expect(store.populationVersion("population-v1")).toMatchObject({ id: "population-v1", state: "ready", period: "202607", sourceSha256: "a".repeat(64) });
    expect(store.populationDong("population-v1", "00123456")).toMatchObject({ count: 744, sumMicros: "999999999999999999", mean: "1344086021505376.342742" });
  });

  it("refuses invalid monthly results as population versions", () => {
    const store = repository();
    store.migrate();
    const invalid = { ...monthly(), status: "invalid" as const, dongs: {} };

    expect(() => store.ingestPopulationVersion({ id: "population-invalid", artifactId: "source-invalid", sourceSha256: "a".repeat(64), sourceByteLength: 100, contractHash: "b".repeat(64), processorVersion: "normalizer-v2", outputHash: "c".repeat(64), monthly: invalid })).toThrow(/valid/);
  });

  it("accepts an identical population version retry without duplicating its rows", () => {
    const store = repository();
    store.migrate();
    const input = { id: "population-v1", artifactId: "source-v1", sourceSha256: "a".repeat(64), sourceByteLength: 100, contractHash: "b".repeat(64), processorVersion: "normalizer-v2", outputHash: "c".repeat(64), monthly: monthly() };

    store.ingestPopulationVersion(input);
    expect(() => store.ingestPopulationVersion(input)).not.toThrow();
    expect(store.populationDong("population-v1", "00123456")).toMatchObject({ count: 744 });
  });

  it("recomputes a comparison set from three ready population versions", () => {
    const store = repository();
    store.migrate();
    store.ingestPopulationVersion(versionInput("version-current", "202607", "150.000000"));
    store.ingestPopulationVersion(versionInput("version-year", "202507", "100.000000"));
    store.ingestPopulationVersion(versionInput("version-month", "202606", "120.000000"));

    store.createComparisonSet({ id: "comparison-202607", currentVersionId: "version-current", previousYearVersionId: "version-year", previousMonthVersionId: "version-month", changes: [], policyVersion: "population-comparison-v2" });

    expect(store.comparison("comparison-202607", "00123456")).toMatchObject({ mode: "same_month_previous_year", comparisonPeriod: "202507", difference: "50.000000" });
  });

  it("publishes and reads one fixed population snapshot", () => {
    const store = repository();
    store.migrate();
    store.ingestPopulationVersion(versionInput("version-current", "202607", "150.000000"));
    store.ingestPopulationVersion(versionInput("version-year", "202507", "100.000000"));
    store.ingestPopulationVersion(versionInput("version-month", "202606", "120.000000"));
    store.createComparisonSet({ id: "comparison-202607", currentVersionId: "version-current", previousYearVersionId: "version-year", previousMonthVersionId: "version-month", changes: [], policyVersion: "population-comparison-v2" });
    store.ingestDongRegistry({ id: "registry-202607", evidence: { id: "registry-evidence", sourceUrl: "https://example.test/registry", sha256: "d".repeat(64) }, entries: [{ code: "00123456", name: "테스트동", districtName: "테스트구", validFrom: "2026-01-01", validToExclusive: null }] });

    store.assemblePopulationSnapshot({ id: "snapshot-202607", contentHash: "a".repeat(64), validationReportHash: "b".repeat(64), publicationEligible: true, currentVersionId: "version-current", previousYearVersionId: "version-year", previousMonthVersionId: "version-month", comparisonSetId: "comparison-202607", registryVersionId: "registry-202607" });
    store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-202607", operationId: "operation-202607", reason: "validated import" });

    expect(store.publishedPopulation("production")).toEqual({ snapshotId: "snapshot-202607", generation: 1, currentVersionId: "version-current", previousYearVersionId: "version-year", previousMonthVersionId: "version-month", comparisonSetId: "comparison-202607" });
    expect(store.publishedPopulationOverview("production", "00123456")).toMatchObject({ status: "available", snapshotId: "snapshot-202607", currentMean: "150.000000", comparisonPeriod: "202507", difference: "50.000000" });
    expect(populationOverviewResponse(store, "production", "00123456").status).toBe(200);
    expect(populationOverviewResponse(store, "production", "00999999").status).toBe(404);
  });

  it("stores an evidence-bound registry version without inventing dong names", () => {
    const store = repository();
    store.migrate();

    store.ingestDongRegistry({ id: "registry-202607", evidence: { id: "official-registry-document", sourceUrl: "https://example.test/registry", sha256: "a".repeat(64) }, entries: [{ code: "00123456", name: "테스트동", districtName: "테스트구", validFrom: "2026-01-01", validToExclusive: null }] });

    expect(store.registryDong("registry-202607", "00123456")).toEqual({ code: "00123456", name: "테스트동", districtName: "테스트구", validFrom: "2026-01-01", validToExclusive: null });
    expect(store.registryDong("registry-202607", "00999999")).toBeUndefined();
  });

  it("publishes a registry-only snapshot without inventing population data", () => {
    const store = repository();
    store.migrate();
    store.ingestDongRegistry({ id: "registry-202607", evidence: { id: "official-registry-document", sourceUrl: "https://example.test/registry", sha256: "a".repeat(64) }, entries: [{ code: "00123456", name: "테스트동", districtName: "테스트구", validFrom: "2026-07-01", validToExclusive: null }] });

    store.assembleRegistrySnapshot({ id: "registry-snapshot-202607", contentHash: "b".repeat(64), validationReportHash: "c".repeat(64), publicationEligible: true, registryVersionId: "registry-202607" });
    store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "registry-snapshot-202607", operationId: "registry-operation-202607", reason: "verified registry import" });

    expect(store.channel("production")).toEqual({ snapshotId: "registry-snapshot-202607", generation: 1 });
    expect(store.hasPublishedDong("production", "00123456")).toBe(true);
    expect(store.publishedPopulation("production")).toBeUndefined();
  });
});
