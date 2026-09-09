import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/publication/d1-context", () => ({ getD1Database: vi.fn(async () => ({ prepare: vi.fn(), batch: vi.fn() })) }));
vi.mock("@/data/publication/d1-read-store", () => ({
  readPublicRegistrySnapshot: vi.fn(async () => ({ snapshotId: "registry-snapshot-20260701", generation: 1, registryVersionId: "mois-20260701", effectiveDate: "2026-07-01" })),
  readPublishedDong: vi.fn(async () => ({ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null })),
}));

import DongPage from "./page";

describe("DongPage", () => {
  it("shows a verified dong and unavailable population state", async () => {
    const markup = renderToStaticMarkup(await DongPage({ params: Promise.resolve({ dongCode: "11680640" }) }));
    expect(markup).toContain("역삼1동");
    expect(markup).toContain("생활인구 데이터를 준비하고 있습니다");
  });
});
