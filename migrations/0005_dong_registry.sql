CREATE TABLE IF NOT EXISTS evidence_documents (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64)
);

CREATE TABLE IF NOT EXISTS dong_registry_versions (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence_documents(id),
  state TEXT NOT NULL CHECK (state IN ('ready', 'rejected'))
);

CREATE TABLE IF NOT EXISTS dong_registry_entries (
  registry_version_id TEXT NOT NULL REFERENCES dong_registry_versions(id),
  code TEXT NOT NULL CHECK (length(code) = 8),
  name TEXT NOT NULL,
  district_name TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to_exclusive TEXT,
  PRIMARY KEY (registry_version_id, code, valid_from),
  CHECK (valid_to_exclusive IS NULL OR valid_to_exclusive > valid_from)
);
