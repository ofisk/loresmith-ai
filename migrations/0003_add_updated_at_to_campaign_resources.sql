-- Add updated_at column to campaign_resources table
-- This column is needed for tracking when resources are modified

alter table campaign_resources add column updated_at datetime default current_timestamp;

-- Update existing records to have updated_at set to created_at
update campaign_resources set updated_at = created_at where updated_at is null;
