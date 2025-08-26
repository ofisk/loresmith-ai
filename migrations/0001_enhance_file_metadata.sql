-- Migration to enhance file_metadata table with AutoRAG analysis results
-- This enables intelligent resource recommendations based on file content analysis

-- Add new columns for enhanced metadata
ALTER TABLE file_metadata ADD COLUMN content_summary TEXT;
ALTER TABLE file_metadata ADD COLUMN key_topics TEXT; -- JSON array of key topics/themes
ALTER TABLE file_metadata ADD COLUMN content_type_categories TEXT; -- JSON array of content types e.g., ["map", "character", "adventure"]
ALTER TABLE file_metadata ADD COLUMN difficulty_level TEXT; -- e.g., "beginner", "intermediate", "advanced"
ALTER TABLE file_metadata ADD COLUMN target_audience TEXT; -- e.g., "players", "dms", "both"
ALTER TABLE file_metadata ADD COLUMN campaign_themes TEXT; -- JSON array of campaign themes
ALTER TABLE file_metadata ADD COLUMN recommended_campaign_types TEXT; -- JSON array of campaign types this resource fits
ALTER TABLE file_metadata ADD COLUMN content_quality_score INTEGER; -- 1-10 score based on analysis
ALTER TABLE file_metadata ADD COLUMN last_analyzed_at DATETIME;
ALTER TABLE file_metadata ADD COLUMN analysis_status TEXT DEFAULT 'pending'; -- pending, analyzing, completed, failed
ALTER TABLE file_metadata ADD COLUMN analysis_error TEXT; -- Store any analysis errors

-- Create index for efficient querying of analyzed files
CREATE INDEX idx_file_metadata_analysis_status ON file_metadata(analysis_status);
CREATE INDEX idx_file_metadata_content_type_categories ON file_metadata(content_type_categories);
CREATE INDEX idx_file_metadata_difficulty_level ON file_metadata(difficulty_level);
CREATE INDEX idx_file_metadata_campaign_themes ON file_metadata(campaign_themes);
CREATE INDEX idx_file_metadata_content_quality_score ON file_metadata(content_quality_score);

-- Create a view for easy querying of analyzed files
CREATE VIEW analyzed_files AS
SELECT 
    file_key,
    username,
    file_name,
    description,
    tags,
    content_summary,
    key_topics,
    content_type_categories,
    difficulty_level,
    target_audience,
    campaign_themes,
    recommended_campaign_types,
    content_quality_score,
    created_at,
    last_analyzed_at
FROM file_metadata 
WHERE analysis_status = 'completed' 
    AND content_summary IS NOT NULL;
