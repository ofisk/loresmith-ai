-- Add campaignRagBasePath column to campaigns table
-- This column stores the base path for campaign-specific AutoRAG folders

ALTER TABLE campaigns ADD COLUMN campaignRagBasePath TEXT;

-- Backfill existing campaigns with default campaignRagBasePath
UPDATE campaigns SET campaignRagBasePath = 'campaigns/' || id WHERE campaignRagBasePath IS NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_rag_base_path ON campaigns(campaignRagBasePath);
