import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";

import { decodeText, detectDelimiter, readArtifact, sha256 } from "./archive";

describe("artifact inspection primitives", () => {
  it("returns a stable lowercase SHA-256 digest", () => {
    expect(sha256(new TextEncoder().encode("uridongne"))).toBe(
      "af75f93b67536d57f99eae15a6fb04ffbc41e73a356f7383a137b145b695f11a",
    );
  });

  it("detects UTF-8 CSV and its delimiter", async () => {
    const bytes = await readFile(new URL("./__fixtures__/store-sample.csv", import.meta.url));

    const decoded = decodeText(bytes);

    expect(decoded.encoding).toBe("utf8");
    expect(detectDelimiter(decoded.text)).toBe(",");
  });

  it("falls back to EUC-KR for Korean delimited text that is not valid UTF-8", () => {
    const bytes = iconv.encode("행정동코드|총생활인구수\n11440660|12345.5", "euc-kr");

    const decoded = decodeText(bytes);

    expect(decoded).toEqual({
      encoding: "euc-kr",
      text: "행정동코드|총생활인구수\n11440660|12345.5",
    });
    expect(detectDelimiter(decoded.text)).toBe("|");
  });

  it("detects semicolon-delimited official population entries", () => {
    const text = '"일자","시간","행정동코드"\n"20260726";"00";"11110515     "';

    expect(detectDelimiter(text)).toBe(";");
  });

  it("reads each non-directory entry from a ZIP artifact", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uridongne-profile-"));
    const archivePath = path.join(directory, "sample.zip");
    const zip = new AdmZip();
    zip.addFile("nested/first.csv", Buffer.from("a,b\n1,2\n", "utf8"));
    zip.addFile("second.csv", Buffer.from("c,d\n3,4\n", "utf8"));
    await writeFile(archivePath, zip.toBuffer());

    try {
      const entries = await readArtifact(archivePath);

      expect(entries.map((entry) => entry.name)).toEqual(["nested/first.csv", "second.csv"]);
      expect(entries.map((entry) => new TextDecoder().decode(entry.bytes))).toEqual(["a,b\n1,2\n", "c,d\n3,4\n"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
