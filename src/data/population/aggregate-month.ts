import { daysInMonth } from "./schema";
import { formatMean } from "./decimal";
import { parseObservation } from "./observation";
import { parseMonthInput } from "./contract";
import type { ExpectedDong, LocatedRow, MonthInput } from "./types";
import { PopulationSourceError, type PopulationDiagnostics } from "./errors";

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
  diagnostics?: PopulationDiagnostics;
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
  const requestedSamples = options.maxErrors ?? 20;
  if (!Number.isSafeInteger(requestedSamples) || requestedSamples < 0) throw new Error("invalid error sample limit");
  const maxErrors = Math.min(requestedSamples, 20);
  const sums = new Map<string, { count: number; sumMicros: bigint; firstDate: string | null; lastDate: string | null }>();
  const registry = options.registryDongs ? new Map(options.registryDongs.map(dong => [dong.code, dong])) : null;
  const slotMasks = new Map<string, Uint8Array>();
  let observedSlotCount = 0;
  const errors: string[] = [];
  let invalid = false;
  let rowCount = 0;
  const diagnostics: PopulationDiagnostics = { counts: {}, samples: [] };
  function recordError(error: unknown, row?: LocatedRow) {
    invalid = true;
    const located = error instanceof PopulationSourceError ? error :
      new PopulationSourceError(row ? "observation_error" : "source_read_error", "unable to process population source", row?.entry ?? "<source>", row?.line ?? null);
    diagnostics.counts[located.code] = (diagnostics.counts[located.code] ?? 0) + 1;
    if (errors.length < maxErrors) {
      errors.push(located.message);
      diagnostics.samples.push({ code: located.code, entry: located.entry, line: located.line });
    }
  }

  try {
    for await (const row of rows) {
      rowCount += 1;
      try {
        const observation = parseObservation(row, period);
        if (registry) {
          const dong = registry.get(observation.dongCode);
          if (!dong) throw new PopulationSourceError("unregistered_dong", "unregistered dong", row.entry, row.line);
          const date = `${observation.date.slice(0, 4)}-${observation.date.slice(4, 6)}-${observation.date.slice(6)}`;
          if (date < dong.validFrom || (dong.validToExclusive !== null && date >= dong.validToExclusive)) {
            throw new PopulationSourceError("outside_dong_validity", "outside dong validity", row.entry, row.line);
          }
        }
        const day = Number(observation.date.slice(6));
        const slotIndex = (day - 1) * 24 + observation.hour;
        const slots = slotMasks.get(observation.dongCode) ?? new Uint8Array(expectedSlotsPerDong);
        if (slots[slotIndex] === 1) throw new PopulationSourceError("duplicate_slot", "duplicate slot", row.entry, row.line);
        slots[slotIndex] = 1;
        slotMasks.set(observation.dongCode, slots);
        observedSlotCount += 1;
        const current = sums.get(observation.dongCode) ?? { count: 0, sumMicros: BigInt(0), firstDate: null, lastDate: null };
        current.count += 1;
        current.sumMicros += observation.populationMicros;
        if (current.firstDate === null || observation.date < current.firstDate) current.firstDate = observation.date;
        if (current.lastDate === null || observation.date > current.lastDate) current.lastDate = observation.date;
        sums.set(observation.dongCode, current);
      } catch (error) {
        recordError(error, row);
      }
    }
  } catch (error) {
    recordError(error);
  }

  if (rowCount === 0 && !invalid) {
    recordError(new PopulationSourceError("empty_source", "empty population source", "<source>"));
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
    observedSlots: observedSlotCount,
    dongs: invalid ? {} : dongs,
    errors,
    diagnostics: { counts: Object.fromEntries(Object.entries(diagnostics.counts).sort(([a], [b]) => a.localeCompare(b))), samples: diagnostics.samples },
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
