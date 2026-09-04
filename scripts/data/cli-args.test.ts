import { describe, expect, it } from "vitest";

import { parseNamedArgs } from "./cli-args";

describe("parseNamedArgs", () => {
  it("returns required named arguments", () => {
    expect(
      parseNamedArgs(["--kind", "store", "--period", "2025"], ["kind", "period"]),
    ).toEqual({ kind: "store", period: "2025" });
  });

  it("rejects repeated arguments", () => {
    expect(() => parseNamedArgs(["--kind", "store", "--kind", "population"], ["kind"])).toThrow(
      "Repeated argument: --kind",
    );
  });
});
