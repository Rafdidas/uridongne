CREATE TABLE IF NOT EXISTS source_artifacts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK (length(period) = 6),
  sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  UNIQUE (source_id, period, sha256)
);

CREATE TABLE IF NOT EXISTS population_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES source_artifacts(id),
  contract_hash TEXT NOT NULL CHECK (length(contract_hash) = 64),
  processor_version TEXT NOT NULL,
  output_hash TEXT NOT NULL CHECK (length(output_hash) = 64),
  input_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('loading', 'ready', 'rejected')),
  coverage_status TEXT NOT NULL,
  UNIQUE (artifact_id, contract_hash, processor_version, output_hash)
);

CREATE TABLE IF NOT EXISTS population_monthly (
  version_id TEXT NOT NULL REFERENCES population_versions(id),
  dong_code TEXT NOT NULL CHECK (length(dong_code) = 8),
  expected_count INTEGER NOT NULL CHECK (expected_count >= 0),
  observed_count INTEGER NOT NULL CHECK (observed_count >= 0),
  missing_count INTEGER NOT NULL CHECK (missing_count >= 0),
  first_date TEXT,
  last_date TEXT,
  sum_micros TEXT NOT NULL,
  mean TEXT,
  status TEXT NOT NULL CHECK (status IN ('complete', 'incomplete')),
  PRIMARY KEY (version_id, dong_code)
);
