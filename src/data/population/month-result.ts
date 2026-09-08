import { daysInMonth } from "./schema";
import { formatMean } from "./decimal";
import { parseMonthInput } from "./contract";
import type { MonthAggregation } from "./aggregate-month";
import type { MonthInput } from "./types";

export interface MonthErrorSample {
  code: string;
  entry: string;
  line: number | null;
}

export interface MonthErrors {
  counts: Record<string, number>;
  samples: MonthErrorSample[];
}

export interface DongMonth {
  dongCode: string;
  expectedCount: number;
  observedCount: number;
  missingCount: number;
  missingRate: number;
  firstDate: string | null;
  lastDate: string | null;
  sumMicros: string;
  mean: string | null;
  status: "complete" | "incomplete";
}

export interface MonthResult {
  input: MonthInput;
  status: "valid" | "invalid";
  coverageStatus: "observed_only" | "expected_registry";
  dongs: DongMonth[];
  errors: MonthErrors;
}

const INPUT_FIELDS = ["input", "status", "coverageStatus", "dongs", "errors"];
const DONG_FIELDS = ["dongCode", "expectedCount", "observedCount", "missingCount", "missingRate", "firstDate", "lastDate", "sumMicros", "mean", "status"];
const ERROR_FIELDS = ["counts", "samples"];
const SAMPLE_FIELDS = ["code", "entry", "line"];

function record(value: unknown, fields: string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid ${name}`);
  const result = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(result);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`invalid ${name}`);
  if (Object.keys(result).some(key => !fields.includes(key)) || fields.some(field => !Object.hasOwn(result, field))) {
    throw new Error(`invalid ${name}`);
  }
  return result;
}

function integer(value: unknown, name: string, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new Error(`invalid ${name}`);
  return value as number;
}

function monthDate(value: unknown, period: string, nullable: boolean): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !/^\d{8}$/.test(value) || !value.startsWith(period)) throw new Error("invalid dong date");
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6));
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) throw new Error("invalid dong date");
  return value;
}

function parseErrors(value: unknown): MonthErrors {
  const input = record(value, ERROR_FIELDS, "errors");
  const countsValue = input.counts;
  if (!countsValue || typeof countsValue !== "object" || Array.isArray(countsValue)) throw new Error("invalid error counts");
  const countsPrototype = Object.getPrototypeOf(countsValue);
  if (countsPrototype !== Object.prototype && countsPrototype !== null) throw new Error("invalid error counts");
  const counts: Record<string, number> = {};
  for (const [code, count] of Object.entries(countsValue)) {
    if (!/^[a-z][a-z0-9_]*$/.test(code)) throw new Error("invalid error code");
    counts[code] = integer(count, `errors.counts.${code}`, 1);
  }
  if (!Number.isSafeInteger(Object.values(counts).reduce((sum, count) => sum + count, 0))) throw new Error("invalid error count total");
  if (!Array.isArray(input.samples) || input.samples.length > 20) throw new Error("invalid error samples");
  const samples = input.samples.map(sample => {
    const item = record(sample, SAMPLE_FIELDS, "error sample");
    if (typeof item.code !== "string" || !Object.hasOwn(counts, item.code)) throw new Error("invalid error sample code");
    if (typeof item.entry !== "string" || !item.entry) throw new Error("invalid error sample entry");
    if (item.line !== null) integer(item.line, "error sample line", 1);
    return { code: item.code, entry: item.entry, line: item.line as number | null };
  });
  for (const [code, count] of Object.entries(counts)) {
    if (samples.filter(sample => sample.code === code).length > count) throw new Error("invalid error samples");
  }
  return { counts, samples };
}

function parseDong(value: unknown, period: string): DongMonth {
  const item = record(value, DONG_FIELDS, "dong");
  if (typeof item.dongCode !== "string" || !/^\d{8}$/.test(item.dongCode)) throw new Error("invalid dong code");
  const expectedCount = integer(item.expectedCount, "expectedCount", 1);
  if (expectedCount !== daysInMonth(period) * 24) throw new Error("invalid expected count");
  const observedCount = integer(item.observedCount, "observedCount");
  const missingCount = integer(item.missingCount, "missingCount");
  if (missingCount !== expectedCount - observedCount || observedCount > expectedCount) throw new Error("invalid dong counts");
  if (typeof item.missingRate !== "number" || !Number.isFinite(item.missingRate) || item.missingRate !== missingCount / expectedCount) throw new Error("invalid missing rate");
  const firstDate = monthDate(item.firstDate, period, true);
  const lastDate = monthDate(item.lastDate, period, true);
  if ((firstDate === null) !== (lastDate === null) || (firstDate !== null && lastDate !== null && firstDate > lastDate)) throw new Error("invalid dong dates");
  if (firstDate !== null && lastDate !== null) {
    const first = Date.UTC(Number(firstDate.slice(0, 4)), Number(firstDate.slice(4, 6)) - 1, Number(firstDate.slice(6)));
    const last = Date.UTC(Number(lastDate.slice(0, 4)), Number(lastDate.slice(4, 6)) - 1, Number(lastDate.slice(6)));
    if (observedCount > ((last - first) / 86_400_000 + 1) * 24) throw new Error("observation count exceeds date range");
  }
  if (typeof item.sumMicros !== "string" || !/^\d+$/.test(item.sumMicros)) throw new Error("invalid sumMicros");
  const status = item.status;
  if (status !== "complete" && status !== "incomplete") throw new Error("invalid dong status");
  if (status === "complete" && (observedCount !== expectedCount || missingCount !== 0 || item.mean === null || firstDate !== `${period}01` || lastDate !== `${period}${String(daysInMonth(period)).padStart(2, "0")}`)) throw new Error("inconsistent complete dong");
  if (status === "incomplete" && (missingCount === 0 || item.mean !== null)) throw new Error("inconsistent incomplete dong");
  if (observedCount === 0 && (firstDate !== null || lastDate !== null)) throw new Error("empty dong has dates");
  if (observedCount === 0 && item.sumMicros !== "0") throw new Error("empty dong has sum");
  if (observedCount > 0 && (firstDate === null || lastDate === null)) throw new Error("observed dong requires dates");
  if (item.mean !== null && (typeof item.mean !== "string" || !/^\d+\.\d{6}$/.test(item.mean) || item.mean !== formatMean(BigInt(item.sumMicros), observedCount))) throw new Error("invalid dong mean");
  return { dongCode: item.dongCode, expectedCount, observedCount, missingCount, missingRate: item.missingRate, firstDate, lastDate, sumMicros: item.sumMicros, mean: item.mean as string | null, status };
}

export function parseMonthResult(value: unknown): MonthResult {
  const item = record(value, INPUT_FIELDS, "month result");
  const input = parseMonthInput(item.input);
  if (item.status !== "valid" && item.status !== "invalid") throw new Error("invalid month result status");
  if (item.coverageStatus !== "observed_only" && item.coverageStatus !== "expected_registry") throw new Error("invalid coverage status");
  if (!Array.isArray(item.dongs)) throw new Error("invalid dongs");
  const dongs = item.dongs.map(dong => parseDong(dong, input.period));
  if (dongs.some((dong, index) => index > 0 && dongs[index - 1].dongCode >= dong.dongCode)) throw new Error("dongs must be sorted and unique");
  const errors = parseErrors(item.errors);
  if (item.status === "valid" && dongs.length === 0) throw new Error("valid result requires dongs");
  if (item.status === "valid" && item.coverageStatus === "expected_registry" && input.registry === null) throw new Error("registry coverage requires registry");
  if (item.status === "valid" && item.coverageStatus === "observed_only" && input.registry !== null) throw new Error("registry requires expected coverage");
  if (item.status === "valid" && input.registry !== null) {
    const activeCodes = input.registry.dongs.filter(dong => dong.validFrom <= `${input.period.slice(0, 4)}-${input.period.slice(4)}-${String(daysInMonth(input.period)).padStart(2, "0")}` && (dong.validToExclusive === null || dong.validToExclusive > `${input.period.slice(0, 4)}-${input.period.slice(4)}-01`)).map(dong => dong.code).sort();
    if (activeCodes.join(",") !== dongs.map(dong => dong.dongCode).sort().join(",")) throw new Error("registry coverage mismatch");
  }
  if (item.status === "invalid" && (dongs.length !== 0 || Object.values(errors.counts).reduce((sum, count) => sum + count, 0) < 1)) throw new Error("invalid result requires diagnostics");
  if (item.status === "valid" && Object.values(errors.counts).some(count => count > 0)) throw new Error("valid result cannot contain source errors");
  return { input, status: item.status, coverageStatus: item.coverageStatus, dongs, errors };
}

export function toMonthResult(month: MonthAggregation): MonthResult {
  if (!month.input || !month.coverageStatus) throw new Error("month aggregation is missing normalized input");
  const errors = parseErrors(month.diagnostics ?? { counts: {}, samples: [] });
  if (month.status === "invalid") {
    const counts = Object.keys(errors.counts).length ? errors.counts : (() => { throw new Error("invalid aggregation is missing diagnostics"); })();
    return parseMonthResult({ input: parseMonthInput(month.input), status: "invalid", coverageStatus: month.coverageStatus, dongs: [], errors: { counts, samples: errors.samples } });
  }
  const expectedCount = month.expectedSlotsPerDong;
  const dongs = Object.values(month.dongs).sort((a, b) => a.dongCode.localeCompare(b.dongCode)).map(dong => ({
    dongCode: dong.dongCode, expectedCount, observedCount: dong.count, missingCount: dong.missingSlots,
    missingRate: dong.missingRate ?? dong.missingSlots / expectedCount, firstDate: dong.firstDate ? dong.firstDate : null,
    lastDate: dong.lastDate ? dong.lastDate : null, sumMicros: dong.sumMicros.toString(), mean: dong.mean, status: dong.status,
  }));
  const result: MonthResult = { input: parseMonthInput(month.input), status: "valid", coverageStatus: month.coverageStatus, dongs, errors };
  return parseMonthResult(result);
}

export function fromMonthResult(result: MonthResult): MonthAggregation {
  if (result.status === "invalid") throw new Error("invalid month result cannot be used as a complete aggregation");
  const dongs = Object.fromEntries(result.dongs.map(dong => [dong.dongCode, {
    dongCode: dong.dongCode, count: dong.observedCount, sumMicros: BigInt(dong.sumMicros), mean: dong.mean,
    missingSlots: dong.missingCount, status: dong.status, firstDate: dong.firstDate, lastDate: dong.lastDate,
    missingRate: dong.missingRate,
  }]));
  return {
    period: result.input.period,
    status: result.dongs.some(dong => dong.status === "incomplete") ? "incomplete" : "complete",
    expectedSlotsPerDong: result.dongs[0]?.expectedCount ?? daysInMonth(result.input.period) * 24,
    observedSlots: result.dongs.reduce((sum, dong) => sum + dong.observedCount, 0),
    dongs, errors: [], input: result.input, coverageStatus: result.coverageStatus,
    methodStatus: result.input.method.status, ...(result.input.method.version === null ? {} : { methodId: result.input.method.version }),
    diagnostics: result.errors,
  };
}
