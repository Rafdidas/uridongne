import { parseDelimitedRecords, profileDelimited } from "./profile-delimited";
import type {
  ArtifactEntry,
  EntryProfile,
  PopulationInvariantProfile,
  PopulationSchema,
  StoreInvariantProfile,
  StoreSchema,
} from "./types";

type SourceKind = "store" | "population";
type SourceSchema = StoreSchema | PopulationSchema;

function incrementLength(lengths: Record<string, number>, value: string): void {
  const length = String(value.trim().length);
  lengths[length] = (lengths[length] ?? 0) + 1;
}

function requiredColumns(kind: SourceKind, schema: SourceSchema): string[] {
  return kind === "store"
    ? Object.values(schema as StoreSchema)
    : Object.values(schema as PopulationSchema);
}

function assertRequiredColumns(headers: string[], kind: SourceKind, schema: SourceSchema): void {
  const missing = requiredColumns(kind, schema).filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`missing required columns: ${missing.join(", ")}`);
  }
}

function measureStore(
  entries: ArtifactEntry[],
  schema: StoreSchema,
): { entries: EntryProfile[]; invariants: StoreInvariantProfile } {
  const keys = new Set<string>();
  const quarters = new Set<string>();
  const dongCodes = new Set<string>();
  const dongCodeLengths: Record<string, number> = {};
  let duplicateKeyCount = 0;
  let totalMismatchCount = 0;
  let negativeCount = 0;
  let nonIntegerCount = 0;

  const profiles = entries.map((entry) => {
    const { records } = parseDelimitedRecords(entry);
    const headers = records[0] ? Object.keys(records[0]) : [];
    assertRequiredColumns(headers, "store", schema);

    for (const record of records) {
      const quarter = record[schema.quarter].trim();
      const dongCode = record[schema.dongCode].trim();
      const industryCode = record[schema.industryCode].trim();
      const key = `${quarter}\u0000${dongCode}\u0000${industryCode}`;
      if (keys.has(key)) duplicateKeyCount += 1;
      else keys.add(key);

      quarters.add(quarter);
      dongCodes.add(dongCode);
      incrementLength(dongCodeLengths, dongCode);

      const total = Number(record[schema.totalStoreCount]);
      const ordinary = Number(record[schema.nonFranchiseStoreCount]);
      const franchise = Number(record[schema.franchiseStoreCount]);
      if ([total, ordinary, franchise].every(Number.isFinite) && total !== ordinary + franchise) {
        totalMismatchCount += 1;
      }

      for (const column of [
        schema.totalStoreCount,
        schema.nonFranchiseStoreCount,
        schema.franchiseStoreCount,
        schema.openingCount,
        schema.closingCount,
      ]) {
        const value = Number(record[column]);
        if (Number.isFinite(value) && value < 0) negativeCount += 1;
        if (Number.isFinite(value) && !Number.isInteger(value)) nonIntegerCount += 1;
      }
    }

    return profileDelimited(entry);
  });

  return {
    entries: profiles,
    invariants: {
      duplicateKeyCount,
      totalMismatchCount,
      negativeCount,
      nonIntegerCount,
      quarterValues: [...quarters].sort(),
      dongCodeLengths,
      dongCodeValues: [...dongCodes].sort(),
    },
  };
}

function measurePopulation(
  entries: ArtifactEntry[],
  schema: PopulationSchema,
): { entries: EntryProfile[]; invariants: PopulationInvariantProfile } {
  const keys = new Set<string>();
  const hours = new Set<number>();
  const dates = new Set<string>();
  const dongCodes = new Set<string>();
  const dongCodeLengths: Record<string, number> = {};
  let duplicateKeyCount = 0;
  let negativeCount = 0;
  let nonFiniteCount = 0;

  const profiles = entries.map((entry) => {
    const { records } = parseDelimitedRecords(entry);
    const headers = records[0] ? Object.keys(records[0]) : [];
    assertRequiredColumns(headers, "population", schema);

    for (const record of records) {
      const date = record[schema.date].trim();
      const hourText = record[schema.hour].trim();
      const dongCode = record[schema.dongCode].trim();
      const key = `${date}\u0000${hourText}\u0000${dongCode}`;
      if (keys.has(key)) duplicateKeyCount += 1;
      else keys.add(key);

      dates.add(date);
      const hour = Number(hourText);
      if (Number.isFinite(hour)) hours.add(hour);
      dongCodes.add(dongCode);
      incrementLength(dongCodeLengths, dongCode);

      const population = Number(record[schema.totalPopulation]);
      if (!Number.isFinite(population)) nonFiniteCount += 1;
      else if (population < 0) negativeCount += 1;
    }

    return profileDelimited(entry);
  });

  const orderedDates = [...dates].sort();
  return {
    entries: profiles,
    invariants: {
      duplicateKeyCount,
      negativeCount,
      nonFiniteCount,
      dateRange: {
        min: orderedDates[0] ?? "",
        max: orderedDates.at(-1) ?? "",
      },
      hourValues: [...hours].sort((left, right) => left - right),
      dongCodeLengths,
      dongCodeValues: [...dongCodes].sort(),
    },
  };
}

export function profileArtifactEntries(
  entries: ArtifactEntry[],
  kind: "store",
  schema: StoreSchema,
): { entries: EntryProfile[]; invariants: StoreInvariantProfile };
export function profileArtifactEntries(
  entries: ArtifactEntry[],
  kind: "population",
  schema: PopulationSchema,
): { entries: EntryProfile[]; invariants: PopulationInvariantProfile };
export function profileArtifactEntries(
  entries: ArtifactEntry[],
  kind: SourceKind,
  schema: SourceSchema,
): { entries: EntryProfile[]; invariants: StoreInvariantProfile | PopulationInvariantProfile } {
  return kind === "store"
    ? measureStore(entries, schema as StoreSchema)
    : measurePopulation(entries, schema as PopulationSchema);
}
