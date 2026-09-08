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

  it("accepts declared optional arguments without making them required", () => {
    expect(parseNamedArgs(["--input", "source.csv"], ["input"], ["work-root"])).toEqual({ input: "source.csv" });
    expect(parseNamedArgs(["--input", "source.csv", "--work-root", "data/work"], ["input"], ["work-root"])).toEqual({ input: "source.csv", "work-root": "data/work" });
  });
});
