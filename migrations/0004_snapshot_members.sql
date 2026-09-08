CREATE TABLE IF NOT EXISTS snapshot_members (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  role TEXT NOT NULL CHECK (role IN ('current', 'previous_year', 'previous_month', 'comparison')),
  population_version_id TEXT REFERENCES population_versions(id),
  comparison_set_id TEXT REFERENCES comparison_sets(id),
  PRIMARY KEY (snapshot_id, role),
  CHECK ((population_version_id IS NOT NULL) != (comparison_set_id IS NOT NULL))
);
