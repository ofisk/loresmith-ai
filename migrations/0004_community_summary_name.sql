-- Add name column to community_summaries table for short AI-generated names
ALTER TABLE community_summaries ADD COLUMN name text;

-- Create index for faster lookups by name
CREATE INDEX IF NOT EXISTS idx_summaries_name ON community_summaries(name);

