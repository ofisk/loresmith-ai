-- Session digests table for storing high-level session recaps and planning information.
-- See issue #216 for full specification.
-- This table stores session digests that capture key events, state changes, and planning context.

CREATE TABLE IF NOT EXISTS session_digests (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  session_number INTEGER NOT NULL,
  session_date DATE,
  digest_data TEXT NOT NULL, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE(campaign_id, session_number)
);

-- Make indexes idempotent so this migration can safely be re-run
CREATE INDEX IF NOT EXISTS idx_digests_campaign ON session_digests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_digests_session ON session_digests(campaign_id, session_number);
CREATE INDEX IF NOT EXISTS idx_digests_date ON session_digests(session_date);

