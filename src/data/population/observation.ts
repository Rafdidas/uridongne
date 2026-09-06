import { daysInMonth } from "./schema";
import { parseMicros } from "./decimal";
import type { LocatedRow, Observation } from "./types";

export function parseObservation(row: LocatedRow, period: string): Observation {
  const date = row.values["일자"]?.trim() ?? "";
  const hourText = row.values["시간"]?.trim() ?? "";
  const dongCode = row.values["행정동코드"]?.trim() ?? "";
  const populationText = row.values["생활인구합계"] ?? "";

  if (!/^\d{8}$/.test(date) || date.slice(0, 6) !== period) {
    throw new Error(`invalid date at ${row.entry}:${row.line}`);
  }

  const day = Number(date.slice(6));
  if (day < 1 || day > daysInMonth(period)) throw new Error(`invalid date at ${row.entry}:${row.line}`);
  if (!/^\d{1,2}$/.test(hourText)) throw new Error(`invalid hour at ${row.entry}:${row.line}`);

  const hour = Number(hourText);
  if (hour > 23) throw new Error(`invalid hour at ${row.entry}:${row.line}`);
  if (!/^\d{8}$/.test(dongCode)) throw new Error(`invalid dong code at ${row.entry}:${row.line}`);

  return { date, hour, dongCode, populationMicros: parseMicros(populationText) };
}
