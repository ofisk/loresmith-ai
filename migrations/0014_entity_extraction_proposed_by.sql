-- Add proposed_by to entity_extraction_queue for proposal-attributed shards
-- When a resource proposal is approved, the proposer is stored so shards can show "co-authored by X (proposer) and Y (approver)"
ALTER TABLE entity_extraction_queue ADD COLUMN proposed_by text;
