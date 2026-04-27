-- Legacy campaign entity extraction queue (removed in 0022). Bootstrap no longer creates this
-- table; this stub allows migrations 0002, 0014, 0017 to apply on fresh D1s.
CREATE TABLE IF NOT EXISTS entity_extraction_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  username TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  file_key TEXT,
  status TEXT,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  error_code TEXT,
  next_retry_at TEXT,
  created_at TEXT,
  processed_at TEXT,
  updated_at TEXT
);
