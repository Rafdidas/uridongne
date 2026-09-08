import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";

import { parseMoisAdministrativeDongBytes } from "./mois-administrative-dong";

function row(code: string, city: string, district: string, dong: string, created: string, abolished = ""): string {
  return `${code} ${city.padEnd(15)} ${district.padEnd(15)} ${dong.padEnd(15)} ${created} ${abolished}`;
}

describe("parseMoisAdministrativeDongBytes", () => {
  it("keeps active Seoul dong codes as 8-digit population registry entries", () => {
    const text = [
      "행정동코드 시도명 시군구명 읍면동명 생성일자 말소일자",
      row("1111051500", "서울특별시", "종로구", "청운효자동", "20081101"),
      row("1111000000", "서울특별시", "종로구", "", "19880423"),
      row("1111053000", "서울특별시", "종로구", "사직동", "19880423", "20260701"),
      row("2611051500", "부산광역시", "중구", "중앙동", "19880423"),
    ].join("\n");

    expect(parseMoisAdministrativeDongBytes(iconv.encode(text, "euc-kr"), "2026-07-01")).toEqual([
      { code: "11110515", name: "청운효자동", districtName: "종로구", validFrom: "2026-07-01", validToExclusive: null },
    ]);
  });
});
