import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/publication/d1-context", () => ({ getD1Database: vi.fn(async () => ({ prepare: vi.fn(), batch: vi.fn() })) }));
vi.mock("@/data/publication/d1-read-store", () => ({
  readPublicRegistrySnapshot: vi.fn(async () => ({ snapshotId: "registry-snapshot-20260701", generation: 1, registryVersionId: "mois-20260701", effectiveDate: "2026-07-01" })),
  readPublishedDong: vi.fn(async (_db, _snapshot, code: string) => code === "11680640" ? { code, name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null } : null),
}));

import { GET } from "./route";

describe("GET /api/dongs/[dongCode]", () => {
  it("rejects malformed codes", async () => {
    expect((await GET(new Request("https://example.test"), { params: Promise.resolve({ dongCode: "bad" }) })).status).toBe(400);
  });

  it("returns a known dong with unavailable population fields", async () => {
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ dongCode: "11680640" }) });

    await expect(response.json()).resolves.toMatchObject({ apiVersion: 1, snapshotId: "registry-snapshot-20260701", dong: { name: "역삼1동", districtName: "강남구" }, population: { status: "unavailable", currentMean: null, reasonCodes: ["population_not_available"] } });
  });
});
