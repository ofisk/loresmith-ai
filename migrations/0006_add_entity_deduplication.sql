-- Create table to track pending deduplication decisions for extracted entities

CREATE TABLE IF NOT EXISTS entity_deduplication_pending (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  new_entity_id TEXT NOT NULL,
  potential_duplicate_ids TEXT NOT NULL,
  similarity_scores TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_decision TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (new_entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entity_dedup_campaign_status ON entity_deduplication_pending(campaign_id, status);

