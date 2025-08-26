-- Add updated_at column to campaign_resources table
-- This column is needed for tracking when resources are modified

ALTER TABLE campaign_resources ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Update existing records to have updated_at set to created_at
UPDATE campaign_resources SET updated_at = created_at WHERE updated_at IS NULL;
