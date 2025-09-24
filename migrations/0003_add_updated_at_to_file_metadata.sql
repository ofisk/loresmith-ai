-- Migration 0003: Add updated_at column to file_metadata table
-- This migration adds the updated_at column for proper stuck file detection

-- Add updated_at column to file_metadata table
ALTER TABLE file_metadata ADD COLUMN updated_at DATETIME;

-- Set updated_at to created_at for existing records
UPDATE file_metadata SET updated_at = created_at WHERE updated_at IS NULL;

-- Create index for efficient stuck file queries
CREATE INDEX IF NOT EXISTS idx_file_metadata_status_updated_at ON file_metadata(status, updated_at);
