-- Add proposed_by to entity_extraction_queue for proposal-attributed shards.
-- Non-destructive: ALTER ADD COLUMN (no table rebuild). Nullable for legacy rows.

ALTER TABLE entity_extraction_queue ADD COLUMN proposed_by TEXT;

-- Match bootstrap + migration 0014 index set (IF NOT EXISTS for replay safety).
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status ON entity_extraction_queue(status);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_next_retry ON entity_extraction_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_campaign ON entity_extraction_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_retry ON entity_extraction_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_updated ON entity_extraction_queue(status, updated_at);
