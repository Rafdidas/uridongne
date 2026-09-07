import { describe, expect, it } from "vitest";
import { parseNormalizationContract } from "./contract";

const contract = () => ({
  period: "202602", asOfDate: "2026-03-01", sourceId: "OA-23016",
  schemaVersion: "oa23016-hourly-v1",
  method: { status: "unverified", version: null, evidenceIds: [] },
  registry: null, expectedSha256: "a".repeat(64),
});

describe("normalization contract validation", () => {
  it("accepts a completed month without claiming verified methodology", () => {
    expect(parseNormalizationContract(contract())).toEqual(contract());
  });
  it.each([
    null, [], {},
    { ...contract(), period: "202613" },
    { ...contract(), period: 202602 },
    { ...contract(), asOfDate: "2026-02-28" },
    { ...contract(), asOfDate: "2026-02-30" },
    { ...contract(), asOfDate: "2026-3-01" },
    { ...contract(), asOfDate: "2026-03-01T00:00:00Z" },
    { ...contract(), sourceId: "OA-14991" },
    { ...contract(), schemaVersion: "unknown" },
    { ...contract(), expectedSha256: "" },
    { ...contract(), expectedSha256: "g".repeat(64) },
    { ...contract(), methodStatus: "verified" },
    { ...contract(), method: { status: "verified", version: null, evidenceIds: [] } },
    { ...contract(), method: { status: "verified", version: "v1", evidenceIds: [" "] } },
    { ...contract(), method: { status: "unverified", version: "v1", evidenceIds: [] } },
  ])("rejects invalid or ambiguous input %#", value => {
    expect(() => parseNormalizationContract(value)).toThrow();
  });
  it("accepts evidence metadata but preserves the references for later audit", () => {
    const value = { ...contract(), method: { status: "verified", version: "official-v1", evidenceIds: ["reviewed-document-id"] } };
    expect(parseNormalizationContract(value).method).toEqual(value.method);
  });
  it("validates leap dates and the year boundary", () => {
    expect(parseNormalizationContract({ ...contract(), period: "202402", asOfDate: "2024-03-01" }).period).toBe("202402");
    expect(parseNormalizationContract({ ...contract(), period: "202512", asOfDate: "2026-01-01" }).period).toBe("202512");
    expect(() => parseNormalizationContract({ ...contract(), asOfDate: "2025-02-29" })).toThrow();
  });
  it("preserves leading zeros in a registry with evidence and date validity", () => {
    const registry = { version: "registry-v1", evidenceIds: ["registry-document"], dongs: [
      { code: "00123456", validFrom: "2020-01-01", validToExclusive: null },
    ] };
    expect(parseNormalizationContract({ ...contract(), registry }).registry).toEqual(registry);
  });
  it.each([
    { version: "v1", evidenceIds: [], dongs: [] },
    { version: "", evidenceIds: ["doc"], dongs: [] },
    { version: "v1", evidenceIds: ["doc"], dongs: [{ code: "1234567", validFrom: "2020-01-01", validToExclusive: null }] },
    { version: "v1", evidenceIds: ["doc"], dongs: [{ code: "00123456", validFrom: "2026-02-30", validToExclusive: null }] },
    { version: "v1", evidenceIds: ["doc"], dongs: [{ code: "00123456", validFrom: "2026-02-01", validToExclusive: "2026-02-01" }] },
    { version: "v1", evidenceIds: ["doc"], dongs: [
      { code: "00123456", validFrom: "2020-01-01", validToExclusive: null },
      { code: "00123456", validFrom: "2021-01-01", validToExclusive: null },
    ] },
  ])("rejects unverified or malformed registry %#", registry => {
    expect(() => parseNormalizationContract({ ...contract(), registry })).toThrow();
  });
});
