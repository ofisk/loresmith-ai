-- Session runsheets: one GM-facing, print-friendly page assembled from existing
-- campaign data (digest recap, planning tasks, entity graph, house rules).
--
-- Runsheets are SNAPSHOTS, not live views: once generated, the content is frozen
-- so the plan cannot shift under the GM mid-session. Regenerating writes a new
-- snapshot; hand-edits are persisted back into runsheet_data.
CREATE TABLE IF NOT EXISTS campaign_runsheets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  session_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  -- JSON snapshot conforming to RunsheetData in src/types/runsheet.ts
  runsheet_data TEXT NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT current_timestamp,
  created_at DATETIME NOT NULL DEFAULT current_timestamp,
  updated_at DATETIME NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Listing is always scoped to a campaign, newest session first.
CREATE INDEX IF NOT EXISTS idx_campaign_runsheets_campaign_session
  ON campaign_runsheets(campaign_id, session_number DESC);
