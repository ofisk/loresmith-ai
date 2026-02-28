-- Dirty tracking tables for incremental graph rebuilds
CREATE TABLE IF NOT EXISTS graph_dirty_entities (
  campaign_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  dirty_reason TEXT,
  marked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, entity_id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_dirty_entities_campaign_marked
  ON graph_dirty_entities(campaign_id, marked_at);

CREATE TABLE IF NOT EXISTS graph_dirty_relationships (
  campaign_id TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  dirty_reason TEXT,
  marked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, from_entity_id, to_entity_id, relationship_type),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_dirty_relationships_campaign_marked
  ON graph_dirty_relationships(campaign_id, marked_at);

-- Dedupe key for rebuild enqueue requests; one active token per campaign
CREATE TABLE IF NOT EXISTS graph_rebuild_job_dedupe (
  campaign_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  rebuild_mode TEXT NOT NULL,
  status TEXT NOT NULL, -- pending | running | completed | failed
  last_rebuild_id TEXT,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, idempotency_key),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_rebuild_job_dedupe_campaign_status
  ON graph_rebuild_job_dedupe(campaign_id, status);
