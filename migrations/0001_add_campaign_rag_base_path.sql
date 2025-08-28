-- Add campaignRagBasePath column to campaigns table
-- This column stores the base path for campaign-specific AutoRAG folders

alter table campaigns add column campaignRagBasePath text;

-- Backfill existing campaigns with default campaignRagBasePath
update campaigns set campaignRagBasePath = 'campaigns/' || id where campaignRagBasePath is null;

-- Create index for efficient lookups
create index if not exists idx_campaigns_rag_base_path on campaigns(campaignRagBasePath);
