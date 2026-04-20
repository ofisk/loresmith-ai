-- Add proposed_by to entity_extraction_queue for proposal-attributed shards.
-- Non-destructive: ALTER ADD COLUMN (no table rebuild). Nullable for legacy rows.
-- New installs via bootstrap may already include the column; legacy DBs may have it from an earlier migration.
--
-- Wrangler cannot "skip" a failed migration automatically. If ALTER ADD proposed_by failed
-- with duplicate column, the column is already present: deploy this version (no ALTER here)
-- and re-run migrate:prod:apply. To mark 0002 applied without re-deploy, insert into
-- d1_migrations with the next id after SELECT MAX(id) FROM d1_migrations (see Cloudflare D1 docs).

ALTER TABLE entity_extraction_queue ADD COLUMN proposed_by TEXT;

-- Match bootstrap + migration 0014 index set (IF NOT EXISTS for replay safety).
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status ON entity_extraction_queue(status);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_next_retry ON entity_extraction_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_campaign ON entity_extraction_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_retry ON entity_extraction_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_updated ON entity_extraction_queue(status, updated_at);
