-- Create communities table for storing community detection results
-- Communities represent clusters of entities detected by the Leiden algorithm

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  level INTEGER NOT NULL, -- Hierarchy level (0 = top level)
  parent_community_id TEXT, -- Parent community in hierarchy
  entity_ids TEXT NOT NULL, -- JSON array of entity IDs
  metadata TEXT, -- JSON for community properties
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_community_id) REFERENCES communities(id) ON DELETE SET NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_communities_campaign_level ON communities(campaign_id, level);
CREATE INDEX IF NOT EXISTS idx_communities_parent ON communities(parent_community_id);
CREATE INDEX IF NOT EXISTS idx_communities_campaign ON communities(campaign_id);

