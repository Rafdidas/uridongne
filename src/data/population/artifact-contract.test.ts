import { describe, expect, it } from "vitest";

import { parseFailureEnvelope, parseSuccessManifest } from "./artifact-contract";

describe("population artifact contract", () => {
  it("accepts a versioned success manifest with deterministic publication fields", () => {
    expect(parseSuccessManifest({
      formatVersion: 2, kind: "population-normalization", processingVersion: "population-normalization-v2",
      sourceSha256: "a".repeat(64), contractSha256: "b".repeat(64), files: { "monthly.json": "c".repeat(64) },
    })).toMatchObject({ formatVersion: 2, kind: "population-normalization" });
  });

  it("rejects legacy or unsupported success manifests", () => {
    expect(() => parseSuccessManifest({ files: { "monthly.json": "a".repeat(64) } })).toThrow(/formatVersion/);
    expect(() => parseSuccessManifest({
      formatVersion: 1, kind: "population-normalization", processingVersion: "legacy",
      sourceSha256: "a".repeat(64), contractSha256: "b".repeat(64), files: { "monthly.json": "c".repeat(64) },
    })).toThrow(/formatVersion/);
  });

  it("accepts invalid diagnostics with positive counts and no samples", () => {
    expect(parseFailureEnvelope({
      formatVersion: 2, kind: "population-normalization-failure", errorsSha256: "a".repeat(64), runSha256: "b".repeat(64),
    })).toMatchObject({ kind: "population-normalization-failure" });
  });
});
