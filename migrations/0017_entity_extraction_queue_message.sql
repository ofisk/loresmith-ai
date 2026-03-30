-- Rename overloaded column: holds failures, rate-limit text, and PROGRESS:a/b checkpoints (not only errors)
ALTER TABLE entity_extraction_queue RENAME COLUMN last_error TO queue_message;
