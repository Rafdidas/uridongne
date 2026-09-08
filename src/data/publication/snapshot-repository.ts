import { createHash } from "node:crypto";

import { compareMonths } from "../population/compare-months";
import { parseMonthInput } from "../population/contract";
import type { MonthAggregation } from "../population/aggregate-month";
import { toPublicPopulation, type PublicPopulation, type PublicPopulationInput } from "./public-population";

interface SqlStatement {
  get(...parameters: unknown[]): unknown;
  all(...parameters: unknown[]): unknown[];
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

export interface PopulationVersionInput {
  id: string;
  artifactId: string;
  sourceSha256: string;
  sourceByteLength: number;
  contractHash: string;
  processorVersion: string;
  outputHash: string;
  monthly: MonthAggregation;
}

export interface ComparisonSetInput {
  id: string;
  currentVersionId: string;
  previousYearVersionId: string;
  previousMonthVersionId: string;
  changes: unknown;
  policyVersion: string;
}

export interface PopulationSnapshotInput extends CreateSnapshot {
  validationReportHash: string;
  currentVersionId: string;
  previousYearVersionId: string;
  previousMonthVersionId: string;
  comparisonSetId: string;
}

export interface PublishedPopulationSnapshot {
  snapshotId: string;
  generation: number;
  currentVersionId: string;
  previousYearVersionId: string;
  previousMonthVersionId: string;
  comparisonSetId: string;
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

const populationSchema = `
  CREATE TABLE IF NOT EXISTS source_artifacts (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    period TEXT NOT NULL CHECK (length(period) = 6),
    sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64),
    byte_length INTEGER NOT NULL CHECK (byte_length > 0),
    UNIQUE (source_id, period, sha256)
  );
  CREATE TABLE IF NOT EXISTS population_versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL REFERENCES source_artifacts(id),
    contract_hash TEXT NOT NULL CHECK (length(contract_hash) = 64),
    processor_version TEXT NOT NULL,
    output_hash TEXT NOT NULL CHECK (length(output_hash) = 64),
    input_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('loading', 'ready', 'rejected')),
    monthly_status TEXT NOT NULL CHECK (monthly_status IN ('complete', 'incomplete')),
    coverage_status TEXT NOT NULL,
    UNIQUE (artifact_id, contract_hash, processor_version, output_hash)
  );
  CREATE TABLE IF NOT EXISTS population_monthly (
    version_id TEXT NOT NULL REFERENCES population_versions(id),
    dong_code TEXT NOT NULL CHECK (length(dong_code) = 8),
    expected_count INTEGER NOT NULL CHECK (expected_count >= 0),
    observed_count INTEGER NOT NULL CHECK (observed_count >= 0),
    missing_count INTEGER NOT NULL CHECK (missing_count >= 0),
    first_date TEXT,
    last_date TEXT,
    sum_micros TEXT NOT NULL,
    mean TEXT,
    status TEXT NOT NULL CHECK (status IN ('complete', 'incomplete')),
    PRIMARY KEY (version_id, dong_code)
  );
`;

const comparisonSchema = `
  CREATE TABLE IF NOT EXISTS comparison_sets (
    id TEXT PRIMARY KEY,
    current_version_id TEXT NOT NULL REFERENCES population_versions(id),
    previous_year_version_id TEXT NOT NULL REFERENCES population_versions(id),
    previous_month_version_id TEXT NOT NULL REFERENCES population_versions(id),
    changes_hash TEXT NOT NULL CHECK (length(changes_hash) = 64),
    policy_version TEXT NOT NULL,
    result_hash TEXT NOT NULL CHECK (length(result_hash) = 64)
  );
  CREATE TABLE IF NOT EXISTS population_comparisons (
    comparison_set_id TEXT NOT NULL REFERENCES comparison_sets(id),
    dong_code TEXT NOT NULL CHECK (length(dong_code) = 8),
    result_json TEXT NOT NULL,
    PRIMARY KEY (comparison_set_id, dong_code)
  );
`;

const snapshotMemberSchema = `
  CREATE TABLE IF NOT EXISTS snapshot_members (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    role TEXT NOT NULL CHECK (role IN ('current', 'previous_year', 'previous_month', 'comparison')),
    population_version_id TEXT REFERENCES population_versions(id),
    comparison_set_id TEXT REFERENCES comparison_sets(id),
    PRIMARY KEY (snapshot_id, role),
    CHECK ((population_version_id IS NOT NULL) != (comparison_set_id IS NOT NULL))
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
    this.database.exec(populationSchema);
    this.database.exec(comparisonSchema);
    this.database.exec(snapshotMemberSchema);
  }

  ingestPopulationVersion(input: PopulationVersionInput): void {
    validIdentifier(input.id, "population version id");
    validIdentifier(input.artifactId, "source artifact id");
    validIdentifier(input.processorVersion, "processor version");
    if (!input.monthly.input || input.monthly.status === "invalid") throw new Error("population version requires a valid monthly result");
    if (!Number.isSafeInteger(input.sourceByteLength) || input.sourceByteLength <= 0) throw new Error("source byte length is invalid");
    for (const [value, name] of [[input.sourceSha256, "source hash"], [input.contractHash, "contract hash"], [input.outputHash, "output hash"]] as const) {
      if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${name} is invalid`);
    }
    const existing = row(this.database.prepare("SELECT v.artifact_id, a.sha256 AS source_sha256, a.byte_length, v.contract_hash, v.processor_version, v.output_hash, v.input_json FROM population_versions v JOIN source_artifacts a ON a.id = v.artifact_id WHERE v.id = ?").get(input.id));
    if (existing) {
      const identical = existing.artifact_id === input.artifactId && existing.source_sha256 === input.sourceSha256.toLowerCase() && existing.byte_length === input.sourceByteLength &&
        existing.contract_hash === input.contractHash.toLowerCase() && existing.processor_version === input.processorVersion && existing.output_hash === input.outputHash.toLowerCase() &&
        existing.input_json === JSON.stringify(input.monthly.input);
      if (identical) return;
      throw new PublicationConflictError("population version id was reused");
    }
    const operation = this.database.transaction(() => {
      const monthly = input.monthly;
      const monthInput = monthly.input!;
      this.database.prepare("INSERT INTO source_artifacts (id, source_id, period, sha256, byte_length) VALUES (?, ?, ?, ?, ?)")
        .run(input.artifactId, monthInput.sourceId, monthly.period, input.sourceSha256.toLowerCase(), input.sourceByteLength);
      this.database.prepare("INSERT INTO population_versions (id, artifact_id, contract_hash, processor_version, output_hash, input_json, state, monthly_status, coverage_status) VALUES (?, ?, ?, ?, ?, ?, 'loading', ?, ?)")
        .run(input.id, input.artifactId, input.contractHash.toLowerCase(), input.processorVersion, input.outputHash.toLowerCase(), JSON.stringify(monthInput), monthly.status, monthly.coverageStatus ?? "observed_only");
      const insertDong = this.database.prepare("INSERT INTO population_monthly (version_id, dong_code, expected_count, observed_count, missing_count, first_date, last_date, sum_micros, mean, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const dong of Object.values(monthly.dongs)) {
        insertDong.run(input.id, dong.dongCode, dong.count + dong.missingSlots, dong.count, dong.missingSlots, dong.firstDate ?? null, dong.lastDate ?? null, dong.sumMicros.toString(), dong.mean, dong.status);
      }
      const ready = this.database.prepare("UPDATE population_versions SET state = 'ready' WHERE id = ? AND state = 'loading'").run(input.id);
      if (ready.changes !== 1) throw new PublicationConflictError("population version cannot be made ready");
    });
    operation();
  }

  populationVersion(id: string): Record<string, unknown> | undefined {
    const value = row(this.database.prepare("SELECT v.id, v.state, a.period, a.sha256 AS source_sha256, v.coverage_status FROM population_versions v JOIN source_artifacts a ON a.id = v.artifact_id WHERE v.id = ?").get(id));
    if (!value) return undefined;
    return { id: value.id, state: value.state, period: value.period, sourceSha256: value.source_sha256, coverageStatus: value.coverage_status };
  }

  populationDong(versionId: string, dongCode: string): Record<string, unknown> | undefined {
    const value = row(this.database.prepare("SELECT observed_count, sum_micros, mean, status FROM population_monthly WHERE version_id = ? AND dong_code = ?").get(versionId, dongCode));
    if (!value) return undefined;
    return { count: value.observed_count, sumMicros: value.sum_micros, mean: value.mean, status: value.status };
  }

  createComparisonSet(input: ComparisonSetInput): void {
    validIdentifier(input.id, "comparison set id");
    validIdentifier(input.policyVersion, "comparison policy version");
    const current = this.readyMonth(input.currentVersionId);
    const previousYear = this.readyMonth(input.previousYearVersionId);
    const previousMonth = this.readyMonth(input.previousMonthVersionId);
    const comparisons = compareMonths(current, previousYear, previousMonth, input.changes);
    const changesText = JSON.stringify(input.changes);
    const resultText = JSON.stringify(comparisons);
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    const operation = this.database.transaction(() => {
      this.database.prepare("INSERT INTO comparison_sets (id, current_version_id, previous_year_version_id, previous_month_version_id, changes_hash, policy_version, result_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(input.id, input.currentVersionId, input.previousYearVersionId, input.previousMonthVersionId, hash(changesText), input.policyVersion, hash(resultText));
      const insert = this.database.prepare("INSERT INTO population_comparisons (comparison_set_id, dong_code, result_json) VALUES (?, ?, ?)");
      for (const comparison of comparisons) insert.run(input.id, comparison.dongCode, JSON.stringify(comparison));
    });
    operation();
  }

  comparison(comparisonSetId: string, dongCode: string): Record<string, unknown> | undefined {
    const value = row(this.database.prepare("SELECT result_json FROM population_comparisons WHERE comparison_set_id = ? AND dong_code = ?").get(comparisonSetId, dongCode));
    return typeof value?.result_json === "string" ? JSON.parse(value.result_json) as Record<string, unknown> : undefined;
  }

  assemblePopulationSnapshot(input: PopulationSnapshotInput): void {
    if (!/^[a-f0-9]{64}$/i.test(input.validationReportHash)) throw new Error("validation report hash is invalid");
    const operation = this.database.transaction(() => {
      this.createSnapshot(input);
      const set = row(this.database.prepare("SELECT current_version_id, previous_year_version_id, previous_month_version_id FROM comparison_sets WHERE id = ?").get(input.comparisonSetId));
      if (!set || set.current_version_id !== input.currentVersionId || set.previous_year_version_id !== input.previousYearVersionId || set.previous_month_version_id !== input.previousMonthVersionId) throw new Error("comparison set does not match snapshot members");
      for (const versionId of [input.currentVersionId, input.previousYearVersionId, input.previousMonthVersionId]) {
        const version = row(this.database.prepare("SELECT state FROM population_versions WHERE id = ?").get(versionId));
        if (!version || version.state !== "ready") throw new Error("snapshot requires ready population versions");
      }
      const insert = this.database.prepare("INSERT INTO snapshot_members (snapshot_id, role, population_version_id, comparison_set_id) VALUES (?, ?, ?, ?)");
      insert.run(input.id, "current", input.currentVersionId, null);
      insert.run(input.id, "previous_year", input.previousYearVersionId, null);
      insert.run(input.id, "previous_month", input.previousMonthVersionId, null);
      insert.run(input.id, "comparison", null, input.comparisonSetId);
      const validated = this.database.prepare("UPDATE snapshots SET state = 'validated', validation_report_hash = ? WHERE id = ? AND state = 'building'").run(input.validationReportHash.toLowerCase(), input.id);
      if (validated.changes !== 1) throw new PublicationConflictError("snapshot cannot be validated");
    });
    operation();
  }

  publishedPopulation(channelName: string): PublishedPopulationSnapshot | undefined {
    validIdentifier(channelName, "channel");
    const value = row(this.database.prepare(`
      SELECT c.snapshot_id, c.generation,
        MAX(CASE WHEN m.role = 'current' THEN m.population_version_id END) AS current_version_id,
        MAX(CASE WHEN m.role = 'previous_year' THEN m.population_version_id END) AS previous_year_version_id,
        MAX(CASE WHEN m.role = 'previous_month' THEN m.population_version_id END) AS previous_month_version_id,
        MAX(CASE WHEN m.role = 'comparison' THEN m.comparison_set_id END) AS comparison_set_id
      FROM public_channels c JOIN snapshot_members m ON m.snapshot_id = c.snapshot_id
      WHERE c.name = ? GROUP BY c.snapshot_id, c.generation
    `).get(channelName));
    if (!value || typeof value.snapshot_id !== "string" || typeof value.generation !== "number" || typeof value.current_version_id !== "string" || typeof value.previous_year_version_id !== "string" || typeof value.previous_month_version_id !== "string" || typeof value.comparison_set_id !== "string") return undefined;
    return { snapshotId: value.snapshot_id, generation: value.generation, currentVersionId: value.current_version_id, previousYearVersionId: value.previous_year_version_id, previousMonthVersionId: value.previous_month_version_id, comparisonSetId: value.comparison_set_id };
  }

  publishedPopulationOverview(channelName: string, dongCode: string): PublicPopulation | undefined {
    const published = this.publishedPopulation(channelName);
    if (!published) return undefined;
    const dong = this.populationDong(published.currentVersionId, dongCode);
    const version = row(this.database.prepare("SELECT v.input_json, a.period FROM population_versions v JOIN source_artifacts a ON a.id = v.artifact_id WHERE v.id = ? AND v.state = 'ready'").get(published.currentVersionId));
    const comparison = this.comparison(published.comparisonSetId, dongCode);
    if (!dong || !version || typeof version.input_json !== "string" || typeof version.period !== "string" || !comparison || typeof dong.mean !== "string" && dong.mean !== null || (dong.status !== "complete" && dong.status !== "incomplete")) return undefined;
    const input = parseMonthInput(JSON.parse(version.input_json));
    const candidateFailures = Array.isArray(comparison.candidateFailures) ? comparison.candidateFailures.filter((item): item is { period: string; reasons: string[] } => Boolean(item) && typeof item === "object" && typeof (item as { period?: unknown }).period === "string" && Array.isArray((item as { reasons?: unknown }).reasons) && (item as { reasons: unknown[] }).reasons.every(reason => typeof reason === "string")) : [];
    const publicInput: PublicPopulationInput = {
      snapshotId: published.snapshotId,
      currentPeriod: version.period,
      current: { mean: dong.mean, status: dong.status, methodStatus: input.method.status },
      comparison: {
        mode: comparison.mode === "same_month_previous_year" || comparison.mode === "previous_month" ? comparison.mode : "unavailable",
        currentValue: typeof comparison.currentValue === "string" ? comparison.currentValue : null,
        candidateValue: typeof comparison.candidateValue === "string" ? comparison.candidateValue : null,
        difference: typeof comparison.difference === "string" ? comparison.difference : null,
        percent: typeof comparison.percent === "string" ? comparison.percent : null,
        reason: typeof comparison.reason === "string" ? comparison.reason : null,
        reasons: Array.isArray(comparison.reasons) ? comparison.reasons.filter((reason): reason is string => typeof reason === "string") : [],
        comparisonPeriod: typeof comparison.comparisonPeriod === "string" ? comparison.comparisonPeriod : null,
        candidateFailures,
      },
    };
    return toPublicPopulation(publicInput);
  }

  private readyMonth(versionId: string): MonthAggregation {
    const version = row(this.database.prepare("SELECT v.state, v.monthly_status, v.coverage_status, v.input_json, a.period FROM population_versions v JOIN source_artifacts a ON a.id = v.artifact_id WHERE v.id = ?").get(versionId));
    if (!version || version.state !== "ready" || typeof version.input_json !== "string" || typeof version.period !== "string" || (version.monthly_status !== "complete" && version.monthly_status !== "incomplete")) throw new Error("comparison requires ready population versions");
    const input = parseMonthInput(JSON.parse(version.input_json));
    const rows = this.database.prepare("SELECT dong_code, observed_count, missing_count, first_date, last_date, sum_micros, mean, status FROM population_monthly WHERE version_id = ? ORDER BY dong_code").all(versionId).map(row);
    const dongs: MonthAggregation["dongs"] = {};
    let observedSlots = 0, expectedSlotsPerDong = 0;
    for (const dong of rows) {
      if (!dong || typeof dong.dong_code !== "string" || typeof dong.observed_count !== "number" || typeof dong.missing_count !== "number" || typeof dong.sum_micros !== "string" || (dong.status !== "complete" && dong.status !== "incomplete")) throw new Error("stored population monthly row is invalid");
      observedSlots += dong.observed_count;
      expectedSlotsPerDong = Math.max(expectedSlotsPerDong, dong.observed_count + dong.missing_count);
      dongs[dong.dong_code] = { dongCode: dong.dong_code, count: dong.observed_count, sumMicros: BigInt(dong.sum_micros), mean: typeof dong.mean === "string" ? dong.mean : null, missingSlots: dong.missing_count, status: dong.status, firstDate: typeof dong.first_date === "string" ? dong.first_date : null, lastDate: typeof dong.last_date === "string" ? dong.last_date : null, missingRate: dong.observed_count + dong.missing_count === 0 ? 0 : dong.missing_count / (dong.observed_count + dong.missing_count) };
    }
    const coverageStatus = version.coverage_status === "observed_only" || version.coverage_status === "expected_registry" ? version.coverage_status : undefined;
    return { period: version.period, status: version.monthly_status, expectedSlotsPerDong, observedSlots, errors: [], coverageStatus, input, dongs };
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
