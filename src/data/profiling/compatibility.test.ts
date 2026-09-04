import { describe, expect, it } from "vitest";

import { compareProfiles } from "./compatibility";
import type { ArtifactProfile } from "./types";

const HEADERS = ["기준일ID", "시간대구분", "행정동코드", "총생활인구수"];

function profile(period: string, headers: string[]): ArtifactProfile {
  return {
    sourceKind: "population",
    period,
    inputName: `${period}.zip`,
    byteLength: 10,
    sha256: "0".repeat(64),
    entries: [{
      name: `${period}.csv`,
      byteLength: 10,
      encoding: "utf8",
      delimiter: ",",
      headers,
      rowCount: 1,
      nullTokens: {},
      numeric: {},
      firstRows: [],
    }],
  };
}

describe("compareProfiles", () => {
  it("chooses the previous year when its structure matches", () => {
    const result = compareProfiles(profile("202607", HEADERS), profile("202507", HEADERS), profile("202606", HEADERS));

    expect(result).toMatchObject({
      comparisonMode: "same_month_previous_year",
      comparisonPeriod: "202507",
      compatible: true,
      fallbackReason: null,
    });
  });

  it("falls back to the previous month when the previous-year schema differs", () => {
    const result = compareProfiles(
      profile("202607", HEADERS),
      profile("202507", [...HEADERS, "LEGACY_FIELD"]),
      profile("202606", HEADERS),
    );

    expect(result).toMatchObject({
      comparisonMode: "previous_month",
      comparisonPeriod: "202606",
      compatible: true,
      fallbackReason: "previous_year_schema_mismatch",
    });
  });

  it("returns unavailable when neither comparison profile matches", () => {
    const result = compareProfiles(
      profile("202607", HEADERS),
      profile("202507", ["OLD_FIELD"]),
      profile("202606", ["OTHER_FIELD"]),
    );

    expect(result).toMatchObject({ comparisonMode: "unavailable", compatible: false });
  });
});
