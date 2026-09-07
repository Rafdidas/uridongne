import { daysInMonth } from "./schema";
import { formatMean } from "./decimal";
import { parseObservation } from "./observation";
import { parseMonthInput } from "./contract";
import type { ExpectedDong, LocatedRow, MonthInput } from "./types";

export interface DongAggregation {
  dongCode: string;
  count: number;
  sumMicros: bigint;
  mean: string | null;
  missingSlots: number;
  status: "complete" | "incomplete";
  firstDate?: string | null;
  lastDate?: string | null;
  missingRate?: number;
}

export interface MonthAggregation {
  period: string;
  status: "complete" | "incomplete" | "invalid";
  expectedSlotsPerDong: number;
  observedSlots: number;
  dongs: Record<string, DongAggregation>;
  errors: string[];
  methodId?: string;
  methodStatus?: "verified" | "unverified";
  input?: MonthInput;
  coverageStatus?: "observed_only" | "expected_registry";
}

export interface AggregateOptions {
  expectedDongCodes?: Iterable<string>;
  maxErrors?: number;
  registryDongs?: ExpectedDong[];
}

export async function aggregatePopulation(
  period: string,
  rows: AsyncIterable<LocatedRow>,
  options: AggregateOptions = {},
): Promise<MonthAggregation> {
  const expectedSlotsPerDong = daysInMonth(period) * 24;
  const maxErrors = options.maxErrors ?? 20;
  const sums = new Map<string, { count: number; sumMicros: bigint; firstDate: string | null; lastDate: string | null }>();
  const registry = options.registryDongs ? new Map(options.registryDongs.map(dong => [dong.code, dong])) : null;
  const slots = new Set<string>();
  const errors: string[] = [];
  let invalid = false;
  let rowCount = 0;

  for await (const row of rows) {
    rowCount += 1;
    try {
      const observation = parseObservation(row, period);
      if (registry) {
        const dong = registry.get(observation.dongCode);
        if (!dong) throw new Error(`unregistered dong at ${row.entry}:${row.line}`);
        const date = `${observation.date.slice(0, 4)}-${observation.date.slice(4, 6)}-${observation.date.slice(6)}`;
        if (date < dong.validFrom || (dong.validToExclusive !== null && date >= dong.validToExclusive)) {
          throw new Error(`outside dong validity at ${row.entry}:${row.line}`);
        }
      }
      const slot = `${observation.dongCode}:${observation.date}:${observation.hour}`;
      if (slots.has(slot)) throw new Error(`duplicate slot at ${row.entry}:${row.line}`);
      slots.add(slot);
      const current = sums.get(observation.dongCode) ?? { count: 0, sumMicros: BigInt(0), firstDate: null, lastDate: null };
      current.count += 1;
      current.sumMicros += observation.populationMicros;
      if (current.firstDate === null || observation.date < current.firstDate) current.firstDate = observation.date;
      if (current.lastDate === null || observation.date > current.lastDate) current.lastDate = observation.date;
      sums.set(observation.dongCode, current);
    } catch (error) {
      invalid = true;
      if (errors.length < maxErrors) errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (rowCount === 0) {
    invalid = true;
    if (errors.length < maxErrors) errors.push("empty population source");
  }

  const dongCodes = new Set<string>(sums.keys());
  for (const dongCode of options.expectedDongCodes ?? []) dongCodes.add(dongCode);

  const dongs: Record<string, DongAggregation> = {};
  let hasIncomplete = false;
  for (const dongCode of [...dongCodes].sort()) {
    const aggregate = sums.get(dongCode) ?? { count: 0, sumMicros: BigInt(0), firstDate: null, lastDate: null };
    const missingSlots = expectedSlotsPerDong - aggregate.count;
    const complete = missingSlots === 0;
    if (!complete) hasIncomplete = true;
    dongs[dongCode] = {
      dongCode,
      count: aggregate.count,
      sumMicros: aggregate.sumMicros,
      mean: complete ? formatMean(aggregate.sumMicros, aggregate.count) : null,
      missingSlots,
      status: complete ? "complete" : "incomplete",
      firstDate: aggregate.firstDate,
      lastDate: aggregate.lastDate,
      missingRate: missingSlots / expectedSlotsPerDong,
    };
  }

  return {
    period,
    status: invalid ? "invalid" : hasIncomplete ? "incomplete" : "complete",
    expectedSlotsPerDong,
    observedSlots: slots.size,
    dongs: invalid ? {} : dongs,
    errors,
  };
}

// Production normalization enters through this contract-aware boundary.
export async function aggregateMonth(rows: AsyncIterable<LocatedRow>, input: MonthInput): Promise<MonthAggregation> {
  const validated = parseMonthInput(input);
  const monthStart = `${validated.period.slice(0, 4)}-${validated.period.slice(4)}-01`;
  const monthEnd = `${validated.period.slice(0, 4)}-${validated.period.slice(4)}-${daysInMonth(validated.period)}`;
  const active = validated.registry?.dongs.filter(dong =>
    dong.validFrom <= monthEnd && (dong.validToExclusive === null || dong.validToExclusive > monthStart));
  const result = await aggregatePopulation(validated.period, rows, {
    expectedDongCodes: active?.map(dong => dong.code),
    registryDongs: validated.registry?.dongs,
  });
  return {
    ...result, input: validated,
    coverageStatus: validated.registry === null ? "observed_only" : "expected_registry",
    methodStatus: validated.method.status,
    ...(validated.method.version === null ? {} : { methodId: validated.method.version }),
  };
}
