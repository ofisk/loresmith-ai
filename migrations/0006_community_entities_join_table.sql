-- Migration 0006: Create normalized join table for community-entity relationships
-- This replaces the JSON array storage in communities.entity_ids with a proper join table
-- This fixes the "LIKE or GLOB pattern too complex" error when searching for communities

-- Create join table for community-entity relationships
CREATE TABLE IF NOT EXISTS community_entities (
  community_id text not null,
  entity_id text not null,
  created_at datetime default current_timestamp,
  primary key (community_id, entity_id),
  foreign key (community_id) references communities(id) on delete cascade,
  foreign key (entity_id) references entities(id) on delete cascade
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_community_entities_community_id ON community_entities(community_id);
CREATE INDEX IF NOT EXISTS idx_community_entities_entity_id ON community_entities(entity_id);

-- Migrate existing data from JSON arrays to join table
-- Parse entity_ids JSON and insert into join table
-- SQLite's json_each returns a table with 'value' column containing the JSON array element
-- IMPORTANT: Only insert entity_ids that actually exist in the entities table
-- This prevents foreign key constraint violations and handles orphaned references gracefully
INSERT INTO community_entities (community_id, entity_id)
SELECT 
  c.id as community_id,
  je.value as entity_id
FROM communities c,
     json_each(c.entity_ids) je
INNER JOIN entities e ON e.id = je.value
WHERE json_valid(c.entity_ids)
  AND NOT EXISTS (
    SELECT 1 FROM community_entities ce 
    WHERE ce.community_id = c.id AND ce.entity_id = je.value
  );

-- Note: We keep the entity_ids column in communities table for now
-- It will be removed in a future migration after all code is updated
-- This allows for a safer migration with rollback capability
