-- Update entity_relationships schema to support typed edges with strength and uniqueness

PRAGMA foreign_keys = OFF;

-- Create new table with desired schema
CREATE TABLE IF NOT EXISTS entity_relationships_new (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength REAL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  UNIQUE(from_entity_id, to_entity_id, relationship_type)
);

-- Migrate data from old table if it exists
INSERT INTO entity_relationships_new (
  id,
  campaign_id,
  from_entity_id,
  to_entity_id,
  relationship_type,
  strength,
  metadata,
  created_at,
  updated_at
)
SELECT
  id,
  campaign_id,
  source_entity_id,
  target_entity_id,
  relationship_type,
  NULL,
  metadata,
  created_at,
  created_at
FROM entity_relationships;

DROP TABLE IF EXISTS entity_relationships;

ALTER TABLE entity_relationships_new
  RENAME TO entity_relationships;

PRAGMA foreign_keys = ON;

-- Indexes for efficient graph queries
CREATE INDEX IF NOT EXISTS idx_relationships_from ON entity_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON entity_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON entity_relationships(relationship_type);

-- Trigger to keep updated_at fresh
CREATE TRIGGER IF NOT EXISTS trigger_entity_relationships_updated_at
AFTER UPDATE ON entity_relationships
FOR EACH ROW
BEGIN
  UPDATE entity_relationships
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

