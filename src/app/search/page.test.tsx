import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/publication/d1-context", () => ({ getD1Database: vi.fn(async () => ({ prepare: vi.fn(), batch: vi.fn() })) }));
vi.mock("@/data/publication/d1-read-store", () => ({
  readPublicRegistrySnapshot: vi.fn(async () => ({ snapshotId: "registry-snapshot-20260701", generation: 1, registryVersionId: "mois-20260701", effectiveDate: "2026-07-01" })),
  searchPublishedDongs: vi.fn(async () => ({ items: [{ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }], hasMore: false })),
}));

import SearchPage from "./page";

describe("SearchPage", () => {
  it("renders matching dongs as detail links", async () => {
    const markup = renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve({ q: "역삼" }) }));

    expect(markup).toContain("역삼1동");
    expect(markup).toContain("강남구");
    expect(markup).toContain('href="/dongs/11680640"');
  });
});
