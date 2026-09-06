import { describe, expect, it } from "vitest";

import { formatMean, parseMicros } from "./decimal";
import { POPULATION_HEADERS, daysInMonth } from "./schema";

describe("population decimal math", () => {
  it("converts bounded decimal input to millionths", () => {
    expect(parseMicros("100.125")).toBe(BigInt(100125000));
    expect(parseMicros("0")).toBe(BigInt(0));
  });

  it("formats rounded means with six decimal places", () => {
    expect(formatMean(BigInt(3), 2)).toBe("0.000002");
    expect(formatMean(BigInt(300000000), 2)).toBe("150.000000");
  });

  it("rejects unsupported numeric text", () => {
    for (const value of ["", " ", "*", "NaN", "Infinity", "1e3", "-1", "1.1234567"]) {
      expect(() => parseMicros(value)).toThrow();
    }
  });

  it("uses the source's complete 32-column contract and calendar month lengths", () => {
    expect(POPULATION_HEADERS).toHaveLength(32);
    expect(daysInMonth("202402")).toBe(29);
    expect(daysInMonth("202502")).toBe(28);
  });
});
