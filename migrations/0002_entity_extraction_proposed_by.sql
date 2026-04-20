-- Indexes for entity_extraction_queue (proposed_by column: new installs via bootstrap;
-- legacy DBs already have it from an earlier schema/migration).
--
-- Wrangler cannot "skip" a failed migration automatically. If ALTER ADD proposed_by failed
-- with duplicate column, the column is already present: deploy this version (no ALTER here)
-- and re-run migrate:prod:apply. To mark 0002 applied without re-deploy, insert into
-- d1_migrations with the next id after SELECT MAX(id) FROM d1_migrations (see Cloudflare D1 docs).

-- Match bootstrap + migration 0014 index set (IF NOT EXISTS for replay safety).
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status ON entity_extraction_queue(status);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_next_retry ON entity_extraction_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_campaign ON entity_extraction_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_retry ON entity_extraction_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_updated ON entity_extraction_queue(status, updated_at);
