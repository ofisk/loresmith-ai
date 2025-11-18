-- Entity importance index table for storing precomputed centrality metrics.
-- See issue #215 for full specification.
-- This table stores PageRank, betweenness centrality, hierarchy level, and composite
-- importance scores for fast lookups and rebuild prioritization.

CREATE TABLE IF NOT EXISTS entity_importance (
  entity_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  pagerank REAL NOT NULL,
  betweenness_centrality REAL NOT NULL,
  hierarchy_level INTEGER NOT NULL,
  importance_score REAL NOT NULL, -- Composite score
  computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX idx_importance_campaign ON entity_importance(campaign_id);
CREATE INDEX idx_importance_score ON entity_importance(importance_score DESC);

