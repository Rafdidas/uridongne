import { describe, expect, it, vi } from "vitest";
vi.mock("@/data/publication/d1-population", () => ({ readPopulation: vi.fn(async () => null) }));

vi.mock("@/data/publication/d1-context", () => ({ getD1Database: vi.fn(async () => ({ prepare: vi.fn(), batch: vi.fn() })) }));
vi.mock("@/data/publication/d1-read-store", () => ({
  readPublicRegistrySnapshot: vi.fn(async () => ({ snapshotId: "registry-snapshot-20260701", generation: 1, registryVersionId: "mois-20260701", effectiveDate: "2026-07-01" })),
  readPublishedDong: vi.fn(async (_db, _snapshot, code: string) => code === "11680640" ? { code, name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null } : null),
}));

import { GET } from "./route";
import { readPopulation } from "@/data/publication/d1-population";

describe("GET /api/dongs/[dongCode]", () => {
  it("passes the captured snapshot to population reads", async () => {
    vi.mocked(readPopulation).mockResolvedValueOnce({ status:"available",snapshotId:"registry-snapshot-20260701",currentPeriod:"202607",currentMean:"150.000000",comparisonMode:"previous_month",comparisonPeriod:"202606",previousMean:"100.000000",difference:"50.000000",percentChange:"50.000000",reasonCodes:[],candidateFailures:[] });
    const response=await GET(new Request("https://example.test"), {params:Promise.resolve({dongCode:"11680640"})});
    expect(await response.json()).toMatchObject({population:{currentMean:"150.000000",comparisonMode:"previous_month"}});
    expect(readPopulation).toHaveBeenLastCalledWith(expect.anything(),"registry-snapshot-20260701","11680640");
  });
  it("rejects malformed codes", async () => {
    expect((await GET(new Request("https://example.test"), { params: Promise.resolve({ dongCode: "bad" }) })).status).toBe(400);
  });

  it("returns a known dong with unavailable population fields", async () => {
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ dongCode: "11680640" }) });

    await expect(response.json()).resolves.toMatchObject({ apiVersion: 1, snapshotId: "registry-snapshot-20260701", dong: { name: "역삼1동", districtName: "강남구" }, population: { status: "unavailable", currentMean: null, reasonCodes: ["population_not_available"] } });
  });
});
