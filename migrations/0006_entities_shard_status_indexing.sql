-- Backfill shard_status on entities + indexes (column: new installs via bootstrap;
-- legacy DBs already have it from an earlier schema/migration).
--
-- Wrangler cannot skip a failed migration automatically. If ALTER ADD shard_status failed
-- with duplicate column, the column is already present: deploy this version (no ALTER here)
-- and re-run migrate:prod:apply.

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
