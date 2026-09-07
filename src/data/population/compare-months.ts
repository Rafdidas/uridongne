import type { DongAggregation, MonthAggregation } from "./aggregate-month";
import { parseMonthInput, POPULATION_SCHEMA_VERSION } from "./contract";

export interface AreaChange {
  dongCode: string;
  effectivePeriod: string;
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

export function compareMonths(current: MonthAggregation, previousYear: MonthAggregation, previousMonth: MonthAggregation, changes: AreaChange[] = []): DongComparison[] {
  const periods = expectedPeriods(current.period);
  if (previousYear.period !== periods.previousYear || previousMonth.period !== periods.previousMonth) throw new Error("comparison candidate period mismatch");
  const methods = new Map([current, previousYear, previousMonth].map(month => [month, verifiedMethodVersion(month)]));
  const codes = new Set([...Object.keys(current.dongs), ...Object.keys(previousYear.dongs), ...Object.keys(previousMonth.dongs)]);
  return [...codes].sort().map((dongCode) => {
    const currentDong = current.dongs[dongCode];
    const reasons: string[] = [];
    if (current.status === "invalid") {
      return { dongCode, mode: "unavailable", currentValue: null, candidateValue: null, difference: null, percent: null, reason: "invalid_source", reasons: ["invalid_source"] };
    }
    if (!currentDong || currentDong.status !== "complete") {
      return { dongCode, mode: "unavailable", currentValue: currentDong?.mean ?? null, candidateValue: null, difference: null, percent: null, reason: "current_incomplete", reasons: ["current_incomplete"] };
    }
    const changed = changes.some((change) => change.dongCode === dongCode && change.effectivePeriod > previousYear.period && change.effectivePeriod <= current.period);
    if (changed) return { dongCode, mode: "unavailable", currentValue: currentDong.mean, candidateValue: null, difference: null, percent: null, reason: "administrative_area_changed", reasons: ["administrative_area_changed"] };
    let candidate = compatible(current, previousYear, dongCode, reasons, methods);
    let mode: DongComparison["mode"] = "same_month_previous_year";
    if (!candidate && !reasons.includes("administrative_area_unverified")) {
      candidate = compatible(current, previousMonth, dongCode, reasons, methods);
      if (candidate) {
        mode = "previous_month";
      }
    }
    if (!candidate) {
      const reason = reasons[0] ?? "unavailable";
      return { dongCode, mode: "unavailable", currentValue: currentDong.mean, candidateValue: null, difference: null, percent: null, reason, reasons };
    }
    const values = difference(currentDong, candidate);
    if (candidate.sumMicros === BigInt(0)) reasons.push("previous_value_zero");
    return { dongCode, mode, currentValue: currentDong.mean, candidateValue: candidate.mean, difference: values.value, percent: values.percent, reason: null, reasons };
  });
}
