ALTER TABLE population_versions ADD COLUMN monthly_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (monthly_status IN ('complete', 'incomplete'));

CREATE TABLE IF NOT EXISTS comparison_sets (
  id TEXT PRIMARY KEY,
  current_version_id TEXT NOT NULL REFERENCES population_versions(id),
  previous_year_version_id TEXT NOT NULL REFERENCES population_versions(id),
  previous_month_version_id TEXT NOT NULL REFERENCES population_versions(id),
  changes_hash TEXT NOT NULL CHECK (length(changes_hash) = 64),
  policy_version TEXT NOT NULL,
  result_hash TEXT NOT NULL CHECK (length(result_hash) = 64)
);

CREATE TABLE IF NOT EXISTS population_comparisons (
  comparison_set_id TEXT NOT NULL REFERENCES comparison_sets(id),
  dong_code TEXT NOT NULL CHECK (length(dong_code) = 8),
  result_json TEXT NOT NULL,
  PRIMARY KEY (comparison_set_id, dong_code)
);
