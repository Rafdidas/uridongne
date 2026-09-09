import { describe, expect, it } from "vitest";

import { readPublicRegistrySnapshot, readPublishedDong, searchPublishedDongs } from "./d1-read-store";
import type { D1Database, D1PreparedStatement, D1Result } from "./d1-types";

interface Call {
  query: string;
  values: unknown[];
}

function result<T>(results: T[]): D1Result<T> {
  return { results, success: true, meta: {} };
}

function database(calls: Call[]): D1Database {
  return {
    prepare(query: string): D1PreparedStatement {
      let boundValues: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          boundValues = values;
          calls.push({ query, values });
          return this;
        },
        async first<T>() {
          if (query.includes("FROM public_channels")) {
            return { snapshotId: "snapshot-1", generation: 4, registryVersionId: "registry-20260701", effectiveDate: "2026-07-01" } as T;
          }
          if (query.includes("FROM dong_registry_entries") && boundValues[0] === "registry-20260701" && boundValues[1] === "11680640") {
            return { code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null } as T;
          }
          return null;
        },
        async all<T>() {
          if (boundValues[0] !== "registry-20260701") throw new Error("registry version was not fixed from the channel snapshot");
          if (boundValues[1] !== "%\\%\\_\\\\%" || boundValues[2] !== "%\\%\\_\\\\%") throw new Error("search wildcards were not escaped");
          return result([{ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }]) as D1Result<T>;
        },
      };
    },
    async batch() { return []; },
  };
}

describe("published D1 registry reads", () => {
  it("uses the registry captured from the public channel and escapes literal LIKE characters", async () => {
    const calls: Call[] = [];
    const db = database(calls);

    const snapshot = await readPublicRegistrySnapshot(db, "production");
    const search = await searchPublishedDongs(db, snapshot!, "%_\\");

    expect(snapshot).toEqual({ snapshotId: "snapshot-1", generation: 4, registryVersionId: "registry-20260701", effectiveDate: "2026-07-01" });
    expect(search).toEqual({ items: [{ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null }], hasMore: false });
    expect(calls).toHaveLength(2);
  });

  it("returns a dong only from the captured registry version", async () => {
    const db = database([]);
    const snapshot = await readPublicRegistrySnapshot(db, "production");

    await expect(readPublishedDong(db, snapshot!, "11680640")).resolves.toEqual({ code: "11680640", name: "역삼1동", districtName: "강남구", validFrom: "2026-07-01", validToExclusive: null });
    await expect(readPublishedDong(db, snapshot!, "00000000")).resolves.toBeNull();
  });
});
