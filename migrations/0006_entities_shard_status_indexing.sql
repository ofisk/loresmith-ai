-- Add shard_status on entities for SQL-level filtering (non-destructive: ALTER only).
-- Preserves entity ids and all FKs referencing entities.id.

ALTER TABLE entities ADD COLUMN shard_status TEXT;

UPDATE entities
SET shard_status = COALESCE(
	json_extract(metadata, '$.shardStatus'),
	'approved'
)
WHERE shard_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_entities_campaign_source
ON entities(campaign_id, source_id);

CREATE INDEX IF NOT EXISTS idx_entities_campaign_shard_status_updated
ON entities(campaign_id, shard_status, updated_at DESC);
