CREATE TABLE single_month_releases (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  period TEXT NOT NULL CHECK(length(period)=6),
  policy TEXT NOT NULL CHECK(policy='source-checked-month-only-v1'),
  evidence_path TEXT NOT NULL
);
