CREATE TABLE IF NOT EXISTS snapshot_registry_members (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id),
  registry_version_id TEXT NOT NULL REFERENCES dong_registry_versions(id)
);
