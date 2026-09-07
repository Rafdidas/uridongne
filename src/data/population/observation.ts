import { daysInMonth } from "./schema";
import { parseMicros } from "./decimal";
import type { LocatedRow, Observation } from "./types";
import { PopulationSourceError } from "./errors";

export function parseObservation(row: LocatedRow, period: string): Observation {
  const invalid = (code: string, message: string): never => {
    throw new PopulationSourceError(code, `${message} at ${row.entry}:${row.line}`, row.entry, row.line);
  };
  const date = row.values["일자"]?.trim() ?? "";
  const hourText = row.values["시간"]?.trim() ?? "";
  const dongCode = row.values["행정동코드"]?.trim() ?? "";
  const populationText = row.values["생활인구합계"] ?? "";

  if (!/^\d{8}$/.test(date) || date.slice(0, 6) !== period) {
    invalid("invalid_date", "invalid date");
  }

  const day = Number(date.slice(6));
  if (day < 1 || day > daysInMonth(period)) invalid("invalid_date", "invalid date");
  if (!/^\d{1,2}$/.test(hourText)) invalid("invalid_hour", "invalid hour");

  const hour = Number(hourText);
  if (hour > 23) invalid("invalid_hour", "invalid hour");
  if (!/^\d{8}$/.test(dongCode)) invalid("invalid_dong_code", "invalid dong code");

  try {
    return { date, hour, dongCode, populationMicros: parseMicros(populationText) };
  } catch {
    return invalid("invalid_population", "invalid population decimal");
  }
}
