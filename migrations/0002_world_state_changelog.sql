-- World state changelog table for tracking structural changes to entities,
-- relationships, and locations over time.
-- See issue #213 for full specification.

CREATE TABLE world_state_changelog (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  campaign_session_id INTEGER,
  timestamp DATETIME NOT NULL,
  changelog_data TEXT NOT NULL, -- JSON payload describing world changes
  impact_score REAL, -- Calculated impact for rebuild heuristics
  applied_to_graph BOOLEAN DEFAULT FALSE, -- Whether applied in last rebuild
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX idx_changelog_campaign ON world_state_changelog(campaign_id);
CREATE INDEX idx_changelog_campaign_session ON world_state_changelog(campaign_session_id);
CREATE INDEX idx_changelog_timestamp ON world_state_changelog(timestamp);
CREATE INDEX idx_changelog_applied ON world_state_changelog(applied_to_graph);


