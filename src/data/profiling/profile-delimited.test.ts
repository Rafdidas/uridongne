import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { profileDelimited } from "./profile-delimited";

describe("profileDelimited", () => {
  it("reports source headers, row count, null markers, and numeric ranges", async () => {
    const bytes = await readFile(new URL("./__fixtures__/store-sample.csv", import.meta.url));

    const profile = profileDelimited({
      name: "store-sample.csv",
      byteLength: bytes.byteLength,
      bytes,
    });

    expect(profile.headers).toEqual([
      "STDR_YYQU_CD",
      "ADSTRD_CD",
      "ADSTRD_CD_NM",
      "SVC_INDUTY_CD",
      "SIMILR_INDUTY_STOR_CO",
      "STOR_CO",
      "FRC_STOR_CO",
    ]);
    expect(profile.rowCount).toBe(1);
    expect(profile.nullTokens).toEqual({});
    expect(profile.numeric.SIMILR_INDUTY_STOR_CO).toEqual({
      min: 12,
      max: 12,
      invalidCount: 0,
    });
  });
});
