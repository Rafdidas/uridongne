const MICROS = BigInt(1_000_000);

export function parseMicros(input: string): bigint {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("population must be a non-negative decimal with at most six fractional digits");
  }

  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * MICROS + BigInt(fraction.padEnd(6, "0") || "0");
}

export function formatMean(sumMicros: bigint, count: number): string {
  if (!Number.isInteger(count) || count <= 0) throw new Error("mean count must be positive");
  if (sumMicros < BigInt(0)) throw new Error("mean sum must be non-negative");

  const divisor = BigInt(count);
  const quotient = sumMicros / divisor;
  const remainder = sumMicros % divisor;
  const rounded = quotient + (remainder * BigInt(2) >= divisor ? BigInt(1) : BigInt(0));
  const whole = rounded / MICROS;
  const fraction = (rounded % MICROS).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}
