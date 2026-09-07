import type { ExpectedDong, MethodEvidence, MonthInput, NormalizationContract } from "./types";

export const POPULATION_SCHEMA_VERSION = "oa23016-hourly-v1";

export class PopulationConfigurationError extends Error {}

function fail(field: string): never {
  throw new PopulationConfigurationError(`invalid population configuration: ${field}`);
}

function object(value: unknown, fields: string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(name);
  const record = value as Record<string, unknown>;
  if (fields.some(key => !Object.hasOwn(record, key)) || Object.keys(record).some(key => !fields.includes(key))) fail(name);
  return record;
}

function nonempty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) fail(field);
  return value;
}

function evidenceIds(value: unknown, field: string, required: boolean): string[] {
  if (!Array.isArray(value) || (required && value.length === 0)) fail(field);
  const result = value.map(item => nonempty(item, field));
  if (new Set(result).size !== result.length) fail(field);
  return result.sort();
}

export function calendarDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) fail(field);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail(field);
  return value;
}

function parseMethod(value: unknown): MethodEvidence {
  const method = object(value, ["status", "version", "evidenceIds"], "method");
  if (method.status !== "verified" && method.status !== "unverified") fail("method.status");
  const verified = method.status === "verified";
  const version = verified ? nonempty(method.version, "method.version") : null;
  if (!verified && method.version !== null) fail("unverified method.version must be null");
  return { status: method.status, version, evidenceIds: evidenceIds(method.evidenceIds, "method.evidenceIds", verified) };
}

function parseRegistry(value: unknown): MonthInput["registry"] {
  if (value === null) return null;
  const registry = object(value, ["version", "evidenceIds", "dongs"], "registry");
  const version = nonempty(registry.version, "registry.version");
  const ids = evidenceIds(registry.evidenceIds, "registry.evidenceIds", true);
  if (!Array.isArray(registry.dongs) || registry.dongs.length === 0) fail("registry.dongs");
  const codes = new Set<string>();
  const dongs: ExpectedDong[] = registry.dongs.map(value => {
    const dong = object(value, ["code", "validFrom", "validToExclusive"], "registry.dong");
    if (typeof dong.code !== "string" || !/^\d{8}$/.test(dong.code) || codes.has(dong.code)) fail("registry.dong.code");
    codes.add(dong.code);
    const validFrom = calendarDate(dong.validFrom, "registry.dong.validFrom");
    const validToExclusive = dong.validToExclusive === null ? null : calendarDate(dong.validToExclusive, "registry.dong.validToExclusive");
    if (validToExclusive !== null && validToExclusive <= validFrom) fail("registry.dong validity");
    return { code: dong.code, validFrom, validToExclusive };
  });
  dongs.sort((a, b) => a.code.localeCompare(b.code));
  return { version, evidenceIds: ids, dongs };
}

const INPUT_FIELDS = ["period", "asOfDate", "sourceId", "schemaVersion", "method", "registry"];

export function parseMonthInput(value: unknown): MonthInput {
  const record = object(value, INPUT_FIELDS, "month input");
  if (typeof record.period !== "string" || !/^[1-9]\d{3}(0[1-9]|1[0-2])$/.test(record.period)) fail("period");
  const asOfDate = calendarDate(record.asOfDate, "asOfDate");
  if (record.period >= asOfDate.slice(0, 7).replace("-", "")) fail("period is not a completed month");
  if (record.sourceId !== "OA-23016") fail("sourceId");
  if (record.schemaVersion !== POPULATION_SCHEMA_VERSION) fail("schemaVersion");
  return {
    period: record.period, asOfDate, sourceId: record.sourceId, schemaVersion: record.schemaVersion,
    method: parseMethod(record.method), registry: parseRegistry(record.registry),
  };
}

export function parseNormalizationContract(value: unknown): NormalizationContract {
  const record = object(value, [...INPUT_FIELDS, "expectedSha256"], "contract");
  if (typeof record.expectedSha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(record.expectedSha256)) fail("expectedSha256");
  const { expectedSha256, ...input } = record;
  return { ...parseMonthInput(input), expectedSha256: expectedSha256.toLowerCase() };
}
