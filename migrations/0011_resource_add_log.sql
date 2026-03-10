-- Per-campaign resource add rate limiting (DoS guardrail: upload → add → delete → repeat)
-- Count resource additions per (username, campaign_id) in rolling 1-hour window
CREATE TABLE IF NOT EXISTS resource_add_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resource_add_log_lookup
  ON resource_add_log(username, campaign_id, created_at);
