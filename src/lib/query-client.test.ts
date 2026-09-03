import { describe, expect, it } from "vitest";

import { makeQueryClient } from "./query-client";

describe("makeQueryClient", () => {
  it("uses the agreed cache and retry defaults", () => {
    const client = makeQueryClient();
    const options = client.getDefaultOptions().queries;

    expect(options?.staleTime).toBe(5 * 60 * 1000);
    expect(options?.gcTime).toBe(30 * 60 * 1000);
    expect(options?.refetchOnWindowFocus).toBe(false);
    expect(options?.retry).toBe(1);
  });
});
