-- Rebuild status table for tracking graph rebuild operations.
-- See issue #221 for full specification.
-- This table stores rebuild status, progress, and metadata for full and partial rebuilds.

CREATE TABLE IF NOT EXISTS rebuild_status (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  rebuild_type TEXT NOT NULL CHECK (rebuild_type IN ('full', 'partial')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  affected_entity_ids TEXT, -- JSON array of affected entity IDs (for partial rebuilds)
  started_at DATETIME,
  completed_at DATETIME,
  error_message TEXT,
  metadata TEXT, -- JSON metadata for additional context (progress, performance metrics, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rebuild_status_campaign ON rebuild_status(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rebuild_status_status ON rebuild_status(status);
CREATE INDEX IF NOT EXISTS idx_rebuild_status_created ON rebuild_status(created_at);

