const SHA256 = /^[a-f0-9]{64}$/;

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid population ${name}`);
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`invalid population ${name}`);
  return value;
}

function hash(value: unknown, name: string): string {
  const result = text(value, name);
  if (!SHA256.test(result)) throw new Error(`invalid population ${name}`);
  return result;
}

export interface PopulationSuccessManifest {
  formatVersion: 2;
  kind: "population-normalization";
  processingVersion: string;
  sourceSha256: string;
  contractSha256: string;
  files: { "monthly.json": string };
}

export interface PopulationFailureEnvelope {
  formatVersion: 2;
  kind: "population-normalization-failure";
  errorsSha256: string;
  runSha256: string;
}

export function parseSuccessManifest(value: unknown): PopulationSuccessManifest {
  const item = object(value, "manifest");
  if (item.formatVersion !== 2) throw new Error("unsupported population manifest formatVersion");
  if (item.kind !== "population-normalization") throw new Error("invalid population manifest kind");
  const files = object(item.files, "manifest files");
  if (Object.keys(files).length !== 1 || !Object.hasOwn(files, "monthly.json")) throw new Error("invalid population manifest files");
  return {
    formatVersion: 2,
    kind: "population-normalization",
    processingVersion: text(item.processingVersion, "manifest processingVersion"),
    sourceSha256: hash(item.sourceSha256, "manifest sourceSha256"),
    contractSha256: hash(item.contractSha256, "manifest contractSha256"),
    files: { "monthly.json": hash(files["monthly.json"], "manifest monthly hash") },
  };
}

export function parseFailureEnvelope(value: unknown): PopulationFailureEnvelope {
  const item = object(value, "failure");
  if (item.formatVersion !== 2) throw new Error("unsupported population failure formatVersion");
  if (item.kind !== "population-normalization-failure") throw new Error("invalid population failure kind");
  return { formatVersion: 2, kind: "population-normalization-failure", errorsSha256: hash(item.errorsSha256, "failure errorsSha256"), runSha256: hash(item.runSha256, "failure runSha256") };
}
