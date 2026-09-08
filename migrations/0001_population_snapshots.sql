CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('building', 'validated', 'rejected')),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  validation_report_hash TEXT CHECK (validation_report_hash IS NULL OR length(validation_report_hash) = 64),
  publication_eligible INTEGER NOT NULL CHECK (publication_eligible IN (0, 1))
);

CREATE TABLE IF NOT EXISTS public_channels (
  name TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES snapshots(id),
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0)
);

CREATE TABLE IF NOT EXISTS publication_events (
  operation_id TEXT PRIMARY KEY,
  channel_name TEXT NOT NULL REFERENCES public_channels(name),
  expected_generation INTEGER NOT NULL,
  generation INTEGER NOT NULL,
  previous_snapshot_id TEXT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  reason TEXT NOT NULL,
  UNIQUE (channel_name, generation)
);
