-- Migration to add character sheets support
-- This enables players to upload and manage character sheets in various formats

-- Character sheets table for storing uploaded character sheet files
CREATE TABLE IF NOT EXISTS character_sheets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'docx', 'doc', 'txt', 'json'
  character_name TEXT,
  description TEXT,
  status TEXT DEFAULT 'uploaded', -- 'uploaded', 'processing', 'completed', 'error'
  extracted_data TEXT, -- JSON data extracted from the character sheet
  metadata TEXT, -- JSON metadata for additional information
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Indexes for character sheets
CREATE INDEX IF NOT EXISTS idx_character_sheets_campaign_id ON character_sheets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_file_key ON character_sheets(file_key);
CREATE INDEX IF NOT EXISTS idx_character_sheets_status ON character_sheets(status);
CREATE INDEX IF NOT EXISTS idx_character_sheets_character_name ON character_sheets(character_name); 