import { daysInMonth } from "./schema";
import { formatMean } from "./decimal";
import { parseObservation } from "./observation";
import type { LocatedRow } from "./types";

export interface DongAggregation {
  dongCode: string;
  count: number;
  sumMicros: bigint;
  mean: string | null;
  missingSlots: number;
  status: "complete" | "incomplete";
}

export interface MonthAggregation {
  period: string;
  status: "complete" | "incomplete" | "invalid";
  expectedSlotsPerDong: number;
  observedSlots: number;
  dongs: Record<string, DongAggregation>;
  errors: string[];
}

export interface AggregateOptions {
  expectedDongCodes?: Iterable<string>;
  maxErrors?: number;
}

export async function aggregatePopulation(
  period: string,
  rows: AsyncIterable<LocatedRow>,
  options: AggregateOptions = {},
): Promise<MonthAggregation> {
  const expectedSlotsPerDong = daysInMonth(period) * 24;
  const maxErrors = options.maxErrors ?? 20;
  const sums = new Map<string, { count: number; sumMicros: bigint }>();
  const slots = new Set<string>();
  const errors: string[] = [];

  for await (const row of rows) {
    try {
      const observation = parseObservation(row, period);
      const slot = `${observation.dongCode}:${observation.date}:${observation.hour}`;
      if (slots.has(slot)) throw new Error(`duplicate slot at ${row.entry}:${row.line}`);
      slots.add(slot);
      const current = sums.get(observation.dongCode) ?? { count: 0, sumMicros: BigInt(0) };
      current.count += 1;
      current.sumMicros += observation.populationMicros;
      sums.set(observation.dongCode, current);
    } catch (error) {
      if (errors.length < maxErrors) errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const dongCodes = new Set<string>(sums.keys());
  for (const dongCode of options.expectedDongCodes ?? []) dongCodes.add(dongCode);

  const dongs: Record<string, DongAggregation> = {};
  let hasIncomplete = false;
  for (const dongCode of [...dongCodes].sort()) {
    const aggregate = sums.get(dongCode) ?? { count: 0, sumMicros: BigInt(0) };
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
    };
  }

  return {
    period,
    status: errors.length > 0 ? "invalid" : hasIncomplete ? "incomplete" : "complete",
    expectedSlotsPerDong,
    observedSlots: slots.size,
    dongs,
    errors,
  };
}
