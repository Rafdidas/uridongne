import iconv from "iconv-lite";

export interface AdministrativeDongRegistryEntry {
  code: string;
  name: string;
  districtName: string;
  validFrom: string;
  validToExclusive: null;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function parseMoisAdministrativeDongBytes(bytes: Uint8Array, validFrom: string): AdministrativeDongRegistryEntry[] {
  if (!validDate(validFrom)) throw new Error("registry validFrom is invalid");
  const entries: AdministrativeDongRegistryEntry[] = [];
  const codes = new Set<string>();
  const lines = iconv.decode(bytes, "euc-kr").split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const dates = line.match(/\s+(\d{8})(?:\s+(\d{8}))?\s*$/);
    if (!dates || dates[2]) continue;
    const fields = line.slice(0, dates.index).trimEnd().split(/\s{2,}/);
    const city = fields.shift()?.match(/^(\d{10})\s+(.+)$/);
    if (!city || city[2] !== "서울특별시" || city[1].slice(5, 8) === "000") continue;
    const [districtName, name] = fields.map(value => value.trim());
    if (!districtName || !name) throw new Error("registry row is incomplete");
    const code = city[1].slice(0, 8);
    if (codes.has(code)) throw new Error("registry contains duplicate dong code");
    codes.add(code);
    entries.push({ code, name, districtName, validFrom, validToExclusive: null });
  }
  if (entries.length === 0) throw new Error("registry contains no Seoul dong");
  return entries.sort((left, right) => left.code.localeCompare(right.code));
}
