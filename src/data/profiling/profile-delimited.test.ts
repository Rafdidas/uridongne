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

  it("profiles numeric ranges beyond the JavaScript argument limit", () => {
    const rows = Array.from({ length: 150_000 }, (_, index) => `${index}`);
    const profile = profileDelimited({
      name: "large.csv",
      byteLength: 0,
      bytes: Buffer.from(`value\n${rows.join("\n")}\n`),
    });

    expect(profile.numeric.value).toEqual({
      min: 0,
      max: 149_999,
      invalidCount: 0,
    });
  });

  it("profiles semicolon-delimited official population rows", () => {
    const profile = profileDelimited({
      name: "population.csv",
      byteLength: 0,
      bytes: Buffer.from(
        '"일자","시간","행정동코드","생활인구합계"\r\n"20260726";"00";"11110515     ";"13912.53"\n',
        "utf8",
      ),
    });

    expect(profile).toMatchObject({
      delimiter: ";",
      headers: ["일자", "시간", "행정동코드", "생활인구합계"],
      rowCount: 1,
      numeric: {
        생활인구합계: { min: 13912.53, max: 13912.53, invalidCount: 0 },
      },
    });
  });
});
