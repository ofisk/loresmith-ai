-- Add first-class shard status column for SQL-level filtering.
ALTER TABLE entities ADD COLUMN shard_status text;

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
