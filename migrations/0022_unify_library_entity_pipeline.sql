-- Campaign resource: track library-entity copy state (replaces per-campaign extraction queue for copy semantics).
ALTER TABLE campaign_resources ADD COLUMN entity_copy_status TEXT NOT NULL DEFAULT 'complete'
  CHECK (entity_copy_status IN ('complete', 'pending_library', 'failed'));
ALTER TABLE campaign_resources ADD COLUMN pending_attribution TEXT; -- JSON: { "proposedBy", "approvedBy" }

CREATE INDEX IF NOT EXISTS idx_campaign_resources_entity_copy
  ON campaign_resources(campaign_id, entity_copy_status);

-- Library discovery: schedule retries and terminal DLQ handoff
ALTER TABLE library_entity_discovery ADD COLUMN next_retry_at TEXT;
ALTER TABLE library_entity_discovery ADD COLUMN support_escalated_at TEXT;

-- Drop campaign-scoped entity extraction queue (replaced by library pipeline + entity_copy_status)
DROP TABLE IF EXISTS entity_extraction_queue;
