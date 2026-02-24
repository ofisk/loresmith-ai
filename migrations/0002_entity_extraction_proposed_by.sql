-- Add proposed_by to entity_extraction_queue for proposal-attributed shards
-- When a resource proposal is approved, the proposer is stored so shards can show "co-authored by X (proposer) and Y (approver)"
-- Nullable for backwards compatibility: existing rows and direct-add flows have NULL
-- Note: Plain ADD COLUMN (no IF NOT EXISTS) for local D1/Miniflare SQLite compatibility.
-- Migrate script treats "duplicate column name" as success for idempotency.
ALTER TABLE entity_extraction_queue ADD COLUMN proposed_by text;
