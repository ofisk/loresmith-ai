-- Files that were fully processed (description generated) but got flipped back
-- to 'error' by the unguarded queueDiscoveryAfterIndexing() call in
-- SyncQueueService (regression from PR #650, fixed alongside this migration).
-- Only touch rows with clear evidence of successful processing: a populated
-- description and no recorded processing_error.
UPDATE file_metadata
SET status = 'completed', updated_at = CURRENT_TIMESTAMP
WHERE status = 'error'
  AND (processing_error IS NULL OR processing_error = '')
  AND description IS NOT NULL
  AND description != '';
