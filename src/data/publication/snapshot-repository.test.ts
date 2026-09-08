import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { PublicationConflictError, SnapshotRepository } from "./snapshot-repository";

const databases: Database.Database[] = [];
function repository() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  databases.push(database);
  return new SnapshotRepository(database);
}
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("SnapshotRepository", () => {
  it("publishes a validated eligible snapshot with a generation-bound event", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-a", contentHash: "a".repeat(64), publicationEligible: true });
    store.validateSnapshot("snapshot-a", "b".repeat(64));

    expect(store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" })).toEqual({ snapshotId: "snapshot-a", generation: 1 });
    expect(store.channel("production")).toEqual({ snapshotId: "snapshot-a", generation: 1 });
  });

  it("rejects a stale writer without changing the published pointer", () => {
    const store = repository();
    store.migrate();
    for (const id of ["snapshot-a", "snapshot-b"]) {
      store.createSnapshot({ id, contentHash: id === "snapshot-a" ? "a".repeat(64) : "b".repeat(64), publicationEligible: true });
      store.validateSnapshot(id, "c".repeat(64));
    }
    store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" });

    expect(() => store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-b", operationId: "operation-b", reason: "stale" })).toThrow(PublicationConflictError);
    expect(store.channel("production")).toEqual({ snapshotId: "snapshot-a", generation: 1 });
  });

  it("does not publish a validated snapshot that lacks public evidence", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-private", contentHash: "a".repeat(64), publicationEligible: false });
    store.validateSnapshot("snapshot-private", "b".repeat(64));

    expect(() => store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-private", operationId: "operation-private", reason: "missing evidence" })).toThrow(/eligible/);
    expect(store.channel("production")).toEqual({ snapshotId: null, generation: 0 });
  });

  it("returns the same completed publication for an idempotent operation retry", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-a", contentHash: "a".repeat(64), publicationEligible: true });
    store.validateSnapshot("snapshot-a", "b".repeat(64));
    const request = { channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" };

    store.publish(request);
    expect(store.publish(request)).toEqual({ snapshotId: "snapshot-a", generation: 1 });
  });

  it("rejects an operation retry whose expected generation changed", () => {
    const store = repository();
    store.migrate();
    store.createSnapshot({ id: "snapshot-a", contentHash: "a".repeat(64), publicationEligible: true });
    store.validateSnapshot("snapshot-a", "b".repeat(64));
    store.publish({ channel: "production", expectedGeneration: 0, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" });

    expect(() => store.publish({ channel: "production", expectedGeneration: 1, snapshotId: "snapshot-a", operationId: "operation-a", reason: "initial" })).toThrow(PublicationConflictError);
  });
});
