import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/publication/d1-context", () => ({ getD1Database: vi.fn(async () => ({ prepare: vi.fn(), batch: vi.fn() })) }));
vi.mock("@/data/publication/d1-read-store", () => ({
  readPublicRegistrySnapshot: vi.fn(async () => ({ snapshotId: "registry-snapshot-20260701", generation: 1, registryVersionId: "mois-20260701", effectiveDate: "2026-07-01" })),
  searchPublishedDongs: vi.fn(async () => ({ items: [{ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }], hasMore: false })),
}));

import { GET } from "./route";

describe("GET /api/dongs", () => {
  it("rejects an empty or overlong search query", async () => {
    expect((await GET(new Request("https://example.test/api/dongs?q=%20"))).status).toBe(400);
    expect((await GET(new Request(`https://example.test/api/dongs?q=${"가".repeat(51)}`))).status).toBe(400);
  });

  it("returns the fixed snapshot and matching dongs", async () => {
    const response = await GET(new Request("https://example.test/api/dongs?q=%EC%97%AD%EC%82%BC"));

    await expect(response.json()).resolves.toEqual({ apiVersion: 1, snapshotId: "registry-snapshot-20260701", effectiveDate: "2026-07-01", items: [{ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }], hasMore: false });
  });
});
