import type { DongAggregation, MonthAggregation } from "./aggregate-month";
import { calendarDate, parseMonthInput, POPULATION_SCHEMA_VERSION } from "./contract";

export interface AreaChange {
  code: string;
  effectiveDate: string;
  evidenceId: string;
  kind: "boundary_change" | "retired" | "created";
}

export interface DongComparison {
  dongCode: string;
  mode: "same_month_previous_year" | "previous_month" | "unavailable";
  currentValue: string | null;
  candidateValue: string | null;
  difference: string | null;
  percent: string | null;
  reason: string | null;
  reasons: string[];
  comparisonMode: "same_month_previous_year" | "previous_month" | "unavailable";
  comparisonPeriod: string | null;
  fallbackReason: string | null;
  candidateFailures: Array<{ period: string; reasons: string[] }>;
  codeMatchBasis: "same_code" | "unavailable";
  currentMean: string | null;
  previousMean: string | null;
  percentChange: string | null;
  percentUnavailableReason: string | null;
}

export function parseAreaChanges(value: unknown): AreaChange[] {
  if (!Array.isArray(value)) throw new Error("area changes must be an array");
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid area change");
    const record = item as Record<string, unknown>;
    const fields = ["code", "effectiveDate", "evidenceId", "kind"];
    if (Object.keys(record).some(key => !fields.includes(key)) || fields.some(field => !Object.hasOwn(record, field))) throw new Error("invalid area change");
    if (typeof record.code !== "string" || !/^\d{8}$/.test(record.code)) throw new Error("invalid area change code");
    if (typeof record.evidenceId !== "string" || !record.evidenceId.trim() || record.evidenceId !== record.evidenceId.trim()) throw new Error("invalid area change evidence");
    if (record.kind !== "boundary_change" && record.kind !== "retired" && record.kind !== "created") throw new Error("invalid area change kind");
    return { code: record.code, effectiveDate: calendarDate(record.effectiveDate, "area change effectiveDate"), evidenceId: record.evidenceId, kind: record.kind };
  });
}

function expectedPeriods(period: string): { previousYear: string; previousMonth: string } {
  if (!/^\d{6}$/.test(period)) throw new Error("invalid current period");
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4));
  if (month < 1 || month > 12) throw new Error("invalid current period");
  const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
  return {
    previousYear: `${year - 1}${String(month).padStart(2, "0")}`,
    previousMonth: `${previousMonthDate.getUTCFullYear()}${String(previousMonthDate.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

function monthEnd(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4));
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatRational(numerator: bigint, denominator: bigint): string {
  if (denominator <= BigInt(0)) throw new Error("rational denominator must be positive");
  const negative = numerator < BigInt(0);
  const absolute = negative ? -numerator : numerator;
  const scaled = absolute * BigInt(1_000_000);
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;
  const rounded = quotient + (remainder * BigInt(2) >= denominator ? BigInt(1) : BigInt(0));
  const whole = rounded / BigInt(1_000_000);
  const fraction = (rounded % BigInt(1_000_000)).toString().padStart(6, "0");
  return `${negative && rounded !== BigInt(0) ? "-" : ""}${whole}.${fraction}`;
}

function difference(current: DongAggregation, candidate: DongAggregation): { value: string; percent: string | null } {
  const numerator = current.sumMicros * BigInt(candidate.count) - candidate.sumMicros * BigInt(current.count);
  const denominator = BigInt(current.count) * BigInt(candidate.count) * BigInt(1_000_000);
  const value = formatRational(numerator, denominator);
  if (candidate.sumMicros === BigInt(0)) return { value, percent: null };
  return {
    value,
    percent: formatRational(numerator * BigInt(100), candidate.sumMicros * BigInt(current.count)),
  };
}

function verifiedMethodVersion(month: MonthAggregation): string | null {
  if (!month.input || month.input.period !== month.period) return null;
  try {
    const input = parseMonthInput(month.input);
    return input.method.status === "verified" ? input.method.version : null;
  } catch {
    return null;
  }
}

function compatible(current: MonthAggregation, candidate: MonthAggregation, dongCode: string, reasons: string[], methods: Map<MonthAggregation, string | null>): DongAggregation | null {
  if (candidate.status === "invalid") {
    reasons.push("invalid_source");
    return null;
  }
  if (!candidate.dongs[dongCode]) {
    reasons.push("administrative_area_unverified");
    return null;
  }
  if (candidate.dongs[dongCode].status !== "complete") {
    reasons.push("candidate_incomplete");
    return null;
  }
  if (current.input && candidate.input &&
    (current.input.schemaVersion !== candidate.input.schemaVersion || current.input.schemaVersion !== POPULATION_SCHEMA_VERSION)) {
    reasons.push("schema_mismatch");
    return null;
  }
  if (!methods.get(current) || !methods.get(candidate)) {
    reasons.push("method_unverified");
    return null;
  }
  if (methods.get(current) !== methods.get(candidate)) {
    reasons.push("method_mismatch");
    return null;
  }
  return candidate.dongs[dongCode];
}

export function compareMonths(current: MonthAggregation, previousYear: MonthAggregation, previousMonth: MonthAggregation, changes: unknown = []): DongComparison[] {
  const validatedChanges = parseAreaChanges(changes);
  const periods = expectedPeriods(current.period);
  if (previousYear.period !== periods.previousYear || previousMonth.period !== periods.previousMonth) throw new Error("comparison candidate period mismatch");
  const methods = new Map([current, previousYear, previousMonth].map(month => [month, verifiedMethodVersion(month)]));
  const codes = new Set([...Object.keys(current.dongs), ...Object.keys(previousYear.dongs), ...Object.keys(previousMonth.dongs)]);
  return [...codes].sort().map((dongCode) => {
    const currentDong = current.dongs[dongCode];
    const reasons: string[] = [];
    const base = (values: Omit<DongComparison, "comparisonMode" | "comparisonPeriod" | "fallbackReason" | "candidateFailures" | "codeMatchBasis" | "currentMean" | "previousMean" | "percentChange" | "percentUnavailableReason">, comparisonPeriod: string | null, candidateFailures: DongComparison["candidateFailures"]): DongComparison => ({
      ...values, comparisonMode: values.mode, comparisonPeriod, fallbackReason: values.mode === "previous_month" ? (candidateFailures.find(failure => failure.period === previousYear.period)?.reasons[0] ?? "previous_year_unavailable") : values.reason,
      candidateFailures, codeMatchBasis: values.mode === "unavailable" ? "unavailable" : "same_code", currentMean: values.currentValue,
      previousMean: values.candidateValue, percentChange: values.percent,
      percentUnavailableReason: values.percent === null && values.mode !== "unavailable" ? (reasons.includes("previous_value_zero") ? "previous_value_zero" : null) : null,
    });
    if (current.status === "invalid") {
      return base({ dongCode, mode: "unavailable", currentValue: null, candidateValue: null, difference: null, percent: null, reason: "invalid_source", reasons: ["invalid_source"] }, null, []);
    }
    if (!currentDong || currentDong.status !== "complete") {
      return base({ dongCode, mode: "unavailable", currentValue: currentDong?.mean ?? null, candidateValue: null, difference: null, percent: null, reason: "current_incomplete", reasons: ["current_incomplete"] }, null, []);
    }
    const previousYearStart = `${previousYear.period.slice(0, 4)}-${previousYear.period.slice(4)}-01`;
    const changed = validatedChanges.some((change) => change.code === dongCode && change.effectiveDate > previousYearStart && change.effectiveDate <= monthEnd(current.period));
    if (changed) return base({ dongCode, mode: "unavailable", currentValue: currentDong.mean, candidateValue: null, difference: null, percent: null, reason: "administrative_area_changed", reasons: ["administrative_area_changed"] }, null, [{ period: previousYear.period, reasons: ["administrative_area_changed"] }]);
    let candidate = compatible(current, previousYear, dongCode, reasons, methods);
    let mode: DongComparison["mode"] = "same_month_previous_year";
    const candidateFailures: DongComparison["candidateFailures"] = [];
    if (!candidate) candidateFailures.push({ period: previousYear.period, reasons: [...reasons] });
    if (!candidate && !reasons.includes("administrative_area_unverified")) {
      const previousReasons = reasons.length;
      candidate = compatible(current, previousMonth, dongCode, reasons, methods);
      if (!candidate) candidateFailures.push({ period: previousMonth.period, reasons: reasons.slice(previousReasons) });
      if (candidate) {
        mode = "previous_month";
      }
    }
    if (!candidate) {
      const reason = reasons[0] ?? "unavailable";
      return base({ dongCode, mode: "unavailable", currentValue: currentDong.mean, candidateValue: null, difference: null, percent: null, reason, reasons }, null, candidateFailures);
    }
    const values = difference(currentDong, candidate);
    if (candidate.sumMicros === BigInt(0)) reasons.push("previous_value_zero");
    return base({ dongCode, mode, currentValue: currentDong.mean, candidateValue: candidate.mean, difference: values.value, percent: values.percent, reason: null, reasons }, mode === "same_month_previous_year" ? previousYear.period : previousMonth.period, candidateFailures);
  });
}
