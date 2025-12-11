-- Changelog archive metadata table for tracking archived changelog entries in R2
-- This table indexes archived changelog entries stored in R2 to enable fast queries
CREATE TABLE IF NOT EXISTS changelog_archive_metadata (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  rebuild_id TEXT NOT NULL,
  archive_key TEXT NOT NULL UNIQUE,
  session_range_min INTEGER,
  session_range_max INTEGER,
  timestamp_range_from DATETIME NOT NULL,
  timestamp_range_to DATETIME NOT NULL,
  entry_count INTEGER NOT NULL,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_archive_campaign ON changelog_archive_metadata(campaign_id);
CREATE INDEX IF NOT EXISTS idx_archive_rebuild ON changelog_archive_metadata(rebuild_id);
CREATE INDEX IF NOT EXISTS idx_archive_session_range ON changelog_archive_metadata(campaign_id, session_range_min, session_range_max);
CREATE INDEX IF NOT EXISTS idx_archive_timestamp_range ON changelog_archive_metadata(campaign_id, timestamp_range_from, timestamp_range_to);

