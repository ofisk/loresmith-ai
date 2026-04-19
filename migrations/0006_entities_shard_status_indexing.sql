-- Add first-class shard status column for SQL-level filtering.
-- Idempotent: `CREATE TABLE AS SELECT` drops PRIMARY KEY / FK parent requirements, which
-- breaks child tables (e.g. graph_dirty_entities). Rebuild with explicit DDL matching bootstrap.

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS entities__m6_bak;
CREATE TABLE entities__m6_bak AS SELECT * FROM entities;

DROP TABLE entities;

CREATE TABLE entities (
  id text primary key,
  campaign_id text not null,
  entity_type text not null,
  name text not null,
  content text,
  metadata text,
  confidence real,
  source_type text,
  source_id text,
  embedding_id text,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  shard_status text,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

INSERT INTO entities (
  id,
  campaign_id,
  entity_type,
  name,
  content,
  metadata,
  confidence,
  source_type,
  source_id,
  embedding_id,
  created_at,
  updated_at,
  shard_status
)
SELECT
  id,
  campaign_id,
  entity_type,
  name,
  content,
  metadata,
  confidence,
  source_type,
  source_id,
  embedding_id,
  created_at,
  updated_at,
  NULL
FROM entities__m6_bak;

DROP TABLE entities__m6_bak;

PRAGMA foreign_keys=ON;

-- Backfill shard status from existing metadata with approved fallback.
UPDATE entities
SET shard_status = COALESCE(
	json_extract(metadata, '$.shardStatus'),
	'approved'
)
WHERE shard_status IS NULL;

-- Add composite indexes for common campaign filtering paths.
CREATE INDEX IF NOT EXISTS idx_entities_campaign_source
ON entities(campaign_id, source_id);

CREATE INDEX IF NOT EXISTS idx_entities_campaign_shard_status_updated
ON entities(campaign_id, shard_status, updated_at DESC);
