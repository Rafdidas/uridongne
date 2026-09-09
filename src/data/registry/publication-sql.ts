import { createHash } from "node:crypto";

export interface RegistryPublicationEntry {
  code: string;
  name: string;
  districtName: string;
  validFrom: string;
  validToExclusive: string | null;
}

export interface RegistryPublicationInput {
  registryVersionId: string;
  evidenceId: string;
  sourceUrl: string;
  sourceSha256: string;
  entries: RegistryPublicationEntry[];
  snapshotId: string;
  operationId: string;
  channel: string;
  expectedGeneration: number;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validIdentifier(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/i.test(value)) throw new Error(`${label} is invalid`);
}

export function buildRegistryPublicationSql(input: RegistryPublicationInput): string {
  validIdentifier(input.registryVersionId, "registry version id");
  validIdentifier(input.evidenceId, "evidence id");
  validIdentifier(input.snapshotId, "snapshot id");
  validIdentifier(input.operationId, "operation id");
  validIdentifier(input.channel, "channel");
  if (!/^https:\/\/.+/.test(input.sourceUrl) || !/^[a-f0-9]{64}$/i.test(input.sourceSha256)) throw new Error("registry evidence is invalid");
  if (!Number.isSafeInteger(input.expectedGeneration) || input.expectedGeneration < 0) throw new Error("expected generation is invalid");
  if (input.entries.length === 0) throw new Error("registry entries are required");

  for (let index = 0; index < input.entries.length; index += 1) {
    const entry = input.entries[index];
    if (!/^\d{8}$/.test(entry.code) || !entry.name.trim() || !entry.districtName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.validFrom) || entry.validToExclusive !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.validToExclusive)) throw new Error("registry entry is invalid");
    if (index > 0 && input.entries[index - 1].code.localeCompare(entry.code) >= 0) throw new Error("registry entries must be sorted by code");
  }

  const contentHash = hash(input.entries);
  const validationReportHash = hash({ sourceSha256: input.sourceSha256.toLowerCase(), contentHash, entries: input.entries.length });
  const statements = [
    `INSERT INTO evidence_documents (id, source_url, sha256) VALUES (${sqlText(input.evidenceId)}, ${sqlText(input.sourceUrl)}, ${sqlText(input.sourceSha256.toLowerCase())});`,
    `INSERT INTO dong_registry_versions (id, evidence_id, state) VALUES (${sqlText(input.registryVersionId)}, ${sqlText(input.evidenceId)}, 'ready');`,
    ...input.entries.map(entry => `INSERT INTO dong_registry_entries (registry_version_id, code, name, district_name, valid_from, valid_to_exclusive) VALUES (${sqlText(input.registryVersionId)}, ${sqlText(entry.code)}, ${sqlText(entry.name)}, ${sqlText(entry.districtName)}, ${sqlText(entry.validFrom)}, ${entry.validToExclusive === null ? "NULL" : sqlText(entry.validToExclusive)});`),
    `INSERT INTO snapshots (id, state, content_hash, validation_report_hash, publication_eligible) VALUES (${sqlText(input.snapshotId)}, 'validated', ${sqlText(contentHash)}, ${sqlText(validationReportHash)}, 1);`,
    `INSERT INTO snapshot_registry_members (snapshot_id, registry_version_id) VALUES (${sqlText(input.snapshotId)}, ${sqlText(input.registryVersionId)});`,
    `INSERT OR IGNORE INTO public_channels (name) VALUES (${sqlText(input.channel)});`,
    `UPDATE public_channels SET snapshot_id = ${sqlText(input.snapshotId)}, generation = generation + 1 WHERE name = ${sqlText(input.channel)} AND generation = ${input.expectedGeneration};`,
    `INSERT INTO publication_events (operation_id, channel_name, expected_generation, generation, previous_snapshot_id, snapshot_id, reason) SELECT ${sqlText(input.operationId)}, ${sqlText(input.channel)}, ${input.expectedGeneration}, generation, NULL, ${sqlText(input.snapshotId)}, 'verified registry import' FROM public_channels WHERE name = ${sqlText(input.channel)} AND snapshot_id = ${sqlText(input.snapshotId)} AND generation = ${input.expectedGeneration + 1};`,
  ];
  return `${statements.join("\n")}\n`;
}
