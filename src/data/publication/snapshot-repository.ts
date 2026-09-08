interface SqlStatement {
  get(...parameters: unknown[]): unknown;
  run(...parameters: unknown[]): { changes: number };
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  transaction<T>(operation: () => T): () => T;
}

export class PublicationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicationConflictError";
  }
}

export interface CreateSnapshot {
  id: string;
  contentHash: string;
  publicationEligible: boolean;
}

export interface PublishSnapshot {
  channel: string;
  expectedGeneration: number;
  snapshotId: string;
  operationId: string;
  reason: string;
}

export interface PublicChannel {
  snapshotId: string | null;
  generation: number;
}

const schema = `
  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('building', 'validated', 'rejected')),
    content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
    validation_report_hash TEXT CHECK (validation_report_hash IS NULL OR length(validation_report_hash) = 64),
    publication_eligible INTEGER NOT NULL CHECK (publication_eligible IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS public_channels (
    name TEXT PRIMARY KEY,
    snapshot_id TEXT REFERENCES snapshots(id),
    generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0)
  );
  CREATE TABLE IF NOT EXISTS publication_events (
    operation_id TEXT PRIMARY KEY,
    channel_name TEXT NOT NULL REFERENCES public_channels(name),
    expected_generation INTEGER NOT NULL,
    generation INTEGER NOT NULL,
    previous_snapshot_id TEXT,
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    reason TEXT NOT NULL,
    UNIQUE (channel_name, generation)
  );
`;

function row(value: unknown): Record<string, unknown> | undefined {
  return value as Record<string, unknown> | undefined;
}

function validIdentifier(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

export class SnapshotRepository {
  constructor(private readonly database: SqliteDatabase) {}

  migrate(): void {
    this.database.exec(schema);
  }

  createSnapshot(snapshot: CreateSnapshot): void {
    validIdentifier(snapshot.id, "snapshot id");
    if (!/^[a-f0-9]{64}$/i.test(snapshot.contentHash)) throw new Error("snapshot content hash is invalid");
    this.database.prepare("INSERT INTO snapshots (id, state, content_hash, publication_eligible) VALUES (?, 'building', ?, ?)")
      .run(snapshot.id, snapshot.contentHash.toLowerCase(), snapshot.publicationEligible ? 1 : 0);
  }

  validateSnapshot(snapshotId: string, validationReportHash: string): void {
    if (!/^[a-f0-9]{64}$/i.test(validationReportHash)) throw new Error("validation report hash is invalid");
    const result = this.database.prepare("UPDATE snapshots SET state = 'validated', validation_report_hash = ? WHERE id = ? AND state = 'building'")
      .run(validationReportHash.toLowerCase(), snapshotId);
    if (result.changes !== 1) throw new PublicationConflictError("snapshot cannot be validated");
  }

  channel(name: string): PublicChannel {
    validIdentifier(name, "channel");
    this.database.prepare("INSERT OR IGNORE INTO public_channels (name) VALUES (?)").run(name);
    const value = row(this.database.prepare("SELECT snapshot_id, generation FROM public_channels WHERE name = ?").get(name));
    if (!value || typeof value.generation !== "number") throw new Error("public channel is missing");
    return { snapshotId: typeof value.snapshot_id === "string" ? value.snapshot_id : null, generation: value.generation };
  }

  publish(request: PublishSnapshot): PublicChannel {
    validIdentifier(request.channel, "channel");
    validIdentifier(request.snapshotId, "snapshot id");
    validIdentifier(request.operationId, "operation id");
    validIdentifier(request.reason, "publication reason");
    if (!Number.isSafeInteger(request.expectedGeneration) || request.expectedGeneration < 0) throw new Error("expected generation is invalid");

    const operation = this.database.transaction(() => {
      const priorEvent = row(this.database.prepare("SELECT channel_name, expected_generation, generation, snapshot_id, reason FROM publication_events WHERE operation_id = ?").get(request.operationId));
      if (priorEvent) {
        if (priorEvent.channel_name !== request.channel || priorEvent.expected_generation !== request.expectedGeneration || priorEvent.snapshot_id !== request.snapshotId || priorEvent.reason !== request.reason) throw new PublicationConflictError("publication operation id was reused");
        return { snapshotId: request.snapshotId, generation: priorEvent.generation as number };
      }
      const snapshot = row(this.database.prepare("SELECT state, publication_eligible FROM snapshots WHERE id = ?").get(request.snapshotId));
      if (!snapshot || snapshot.state !== "validated" || snapshot.publication_eligible !== 1) throw new Error("snapshot is not validated and publication eligible");
      const channel = this.channel(request.channel);
      const update = this.database.prepare("UPDATE public_channels SET snapshot_id = ?, generation = generation + 1 WHERE name = ? AND generation = ?")
        .run(request.snapshotId, request.channel, request.expectedGeneration);
      if (update.changes !== 1) throw new PublicationConflictError("public channel generation changed");
      const generation = request.expectedGeneration + 1;
      this.database.prepare("INSERT INTO publication_events (operation_id, channel_name, expected_generation, generation, previous_snapshot_id, snapshot_id, reason) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(request.operationId, request.channel, request.expectedGeneration, generation, channel.snapshotId, request.snapshotId, request.reason);
      return { snapshotId: request.snapshotId, generation };
    });
    return operation();
  }
}
