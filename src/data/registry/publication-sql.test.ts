import { describe, expect, it } from "vitest";

import { buildRegistryPublicationSql } from "./publication-sql";

describe("buildRegistryPublicationSql", () => {
  it("creates a deterministic registry-only publication transaction", () => {
    const sql = buildRegistryPublicationSql({
      registryVersionId: "mois-20260701",
      evidenceId: "mois-jscode-2026-07-01",
      sourceUrl: "https://example.test/jscode.zip",
      sourceSha256: "a".repeat(64),
      entries: [{ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }],
      snapshotId: "registry-snapshot-20260701",
      operationId: "registry-publish-20260701",
      channel: "production",
      expectedGeneration: 0,
    });

    expect(sql).not.toContain("BEGIN");
    expect(sql).toContain("'mois-20260701'");
    expect(sql).toContain("'11680640', '역삼1동', '강남구', '2026-07-01', NULL");
    expect(sql).toContain("UPDATE public_channels SET snapshot_id = 'registry-snapshot-20260701', generation = generation + 1 WHERE name = 'production' AND generation = 0;");
    expect(sql).toContain("INSERT INTO publication_events");
    expect(sql.endsWith(";\n")).toBe(true);
  });

  it("rejects an unsorted or malformed registry before generating SQL", () => {
    expect(() => buildRegistryPublicationSql({
      registryVersionId: "mois-20260701", evidenceId: "mois-jscode-2026-07-01", sourceUrl: "https://example.test/jscode.zip", sourceSha256: "a".repeat(64),
      entries: [{ code: "21680640", name: "나", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }, { code: "11680640", name: "가", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }],
      snapshotId: "registry-snapshot-20260701", operationId: "registry-publish-20260701", channel: "production", expectedGeneration: 0,
    })).toThrow("registry entries must be sorted by code");
  });
});
