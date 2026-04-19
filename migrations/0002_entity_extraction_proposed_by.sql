-- Add proposed_by to entity_extraction_queue for proposal-attributed shards
-- When a resource proposal is approved, the proposer is stored so shards can show "co-authored by X (proposer) and Y (approver)"
-- Nullable for backwards compatibility: existing rows and direct-add flows have NULL
--
-- Idempotent for `wrangler d1 migrations apply`: SQLite has no "ADD COLUMN IF NOT EXISTS".
-- Rebuild the table from a backup using `SELECT *, CAST(NULL AS TEXT) AS proposed_by`:
-- - If `proposed_by` was missing, it is added once.
-- - If it already existed, SQLite appends a second column named `proposed_by:1` (NULLs).
--   Code and queries use the real `proposed_by` column (first); the stray column is harmless.
-- Preserves whatever message column exists (`last_error` before migration 0017, or
-- `queue_message` after 0017 if this migration is replayed with a drifted journal).
--
-- Restores queue indexes from bootstrap plus migration 0014.

DROP TABLE IF EXISTS entity_extraction_queue__m2_bak;
CREATE TABLE entity_extraction_queue__m2_bak AS SELECT * FROM entity_extraction_queue;

DROP TABLE entity_extraction_queue;

CREATE TABLE entity_extraction_queue AS
SELECT
  *,
  CAST(NULL AS TEXT) AS proposed_by
FROM entity_extraction_queue__m2_bak;

DROP TABLE entity_extraction_queue__m2_bak;

CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status ON entity_extraction_queue(status);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_next_retry ON entity_extraction_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_campaign ON entity_extraction_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_retry ON entity_extraction_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_updated ON entity_extraction_queue(status, updated_at);
