-- Add shard registry table for efficient shard tracking and lookup
-- This table provides O(1) lookups by shard ID and replaces expensive R2 scans

-- Create shard registry table
CREATE TABLE IF NOT EXISTS shard_registry (
  shard_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,           -- Current R2 path (staging, approved, or rejected)
  shard_type TEXT NOT NULL,       -- Entity type (spells, monsters, etc.)
  status TEXT NOT NULL DEFAULT 'staging',  -- 'staging', 'approved', 'rejected', 'deleted'
  confidence REAL,                -- Confidence score from AI extraction
  source TEXT,                    -- Source system (e.g., 'library_autorag_ai_search')
  rejection_reason TEXT,          -- Reason if rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,                -- Soft delete timestamp
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_shard_registry_campaign_id ON shard_registry(campaign_id);
CREATE INDEX IF NOT EXISTS idx_shard_registry_resource_id ON shard_registry(resource_id);
CREATE INDEX IF NOT EXISTS idx_shard_registry_status ON shard_registry(status);
CREATE INDEX IF NOT EXISTS idx_shard_registry_campaign_status ON shard_registry(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_shard_registry_shard_type ON shard_registry(shard_type);
CREATE INDEX IF NOT EXISTS idx_shard_registry_r2_key ON shard_registry(r2_key);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_shard_registry_timestamp 
  AFTER UPDATE ON shard_registry
  FOR EACH ROW
BEGIN
  UPDATE shard_registry SET updated_at = datetime('now') WHERE shard_id = NEW.shard_id;
END;

