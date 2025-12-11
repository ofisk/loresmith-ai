-- Session digest enhancements: Add status, quality validation, templates, and review workflow support
-- This migration adds fields for automated generation, quality scoring, review workflow, and templates

-- Add new columns to session_digests table
ALTER TABLE session_digests ADD COLUMN status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'approved', 'rejected'));
ALTER TABLE session_digests ADD COLUMN quality_score REAL; -- 0-10 scale, nullable
ALTER TABLE session_digests ADD COLUMN review_notes TEXT; -- DM review feedback
ALTER TABLE session_digests ADD COLUMN generated_by_ai INTEGER DEFAULT 0; -- Boolean: 0 = false, 1 = true
ALTER TABLE session_digests ADD COLUMN template_id TEXT; -- References session_digest_templates(id)
ALTER TABLE session_digests ADD COLUMN source_type TEXT DEFAULT 'manual' CHECK(source_type IN ('manual', 'ai_generated'));

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_digests_status ON session_digests(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_digests_template ON session_digests(template_id);
CREATE INDEX IF NOT EXISTS idx_digests_source_type ON session_digests(source_type);

-- Create session_digest_templates table for reusable digest templates
CREATE TABLE IF NOT EXISTS session_digest_templates (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template_data TEXT NOT NULL, -- JSON structure matching SessionDigestData
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digest_templates_campaign ON session_digest_templates(campaign_id);

-- Add foreign key constraint for template_id
-- Note: SQLite doesn't support ADD CONSTRAINT, so this is documented but not enforced
-- The application layer should handle referential integrity

