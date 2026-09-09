import { describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getD1Database } from "./d1-context";
import type { D1Database } from "./d1-types";

const getContext = vi.mocked(getCloudflareContext);
const database = { prepare: vi.fn(), batch: vi.fn() } as unknown as D1Database;

describe("getD1Database", () => {
  it("returns the request-time DB binding", async () => {
    getContext.mockResolvedValue({ env: { DB: database }, cf: undefined, ctx: {} });

    await expect(getD1Database()).resolves.toBe(database);
  });

  it("rejects a request without the DB binding", async () => {
    getContext.mockResolvedValue({ env: {}, cf: undefined, ctx: {} });

    await expect(getD1Database()).rejects.toThrow("D1 binding DB is not configured");
  });
});
