-- Add processing_error field to store error codes and metadata
-- This allows us to track specific error types (e.g., MEMORY_LIMIT_EXCEEDED)
-- and prevent infinite retries for non-retryable errors
ALTER TABLE file_metadata ADD COLUMN processing_error TEXT;
