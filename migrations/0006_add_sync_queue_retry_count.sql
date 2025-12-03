-- Add retry_count and updated_at columns to sync_queue table
-- retry_count tracks how many times a queue item has been retried
-- updated_at tracks when the item was last modified (e.g., retry count updated)
ALTER TABLE sync_queue ADD COLUMN retry_count integer not null default 0;
ALTER TABLE sync_queue ADD COLUMN updated_at datetime;

