-- LLM usage log for per-user rate limiting (TPH, QPH, TPD, QPD)
-- Pruned by scheduled worker every 30 min (rows older than 25 hours)
CREATE TABLE IF NOT EXISTS llm_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  query_count INTEGER NOT NULL DEFAULT 1,
  model TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_username_time
  ON llm_usage_log(username, created_at);
