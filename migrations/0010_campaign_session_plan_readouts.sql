-- Persist session plan readouts per campaign/session to avoid redundant LLM token usage
CREATE TABLE IF NOT EXISTS campaign_session_plan_readouts (
  campaign_id TEXT NOT NULL,
  next_session_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT current_timestamp,
  updated_at DATETIME DEFAULT current_timestamp,
  PRIMARY KEY (campaign_id, next_session_number),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
