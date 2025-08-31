-- Add staged_snippets table for better snippet management
CREATE TABLE IF NOT EXISTS staged_snippets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  snippet_type TEXT NOT NULL, -- 'monster', 'spell', 'npc', etc.
  content TEXT NOT NULL, -- JSON content of the snippet
  metadata TEXT, -- additional metadata as JSON
  status TEXT DEFAULT 'staged', -- 'staged', 'approved', 'rejected'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES campaign_resources(id) ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_staged_snippets_campaign_id ON staged_snippets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_staged_snippets_resource_id ON staged_snippets(resource_id);
CREATE INDEX IF NOT EXISTS idx_staged_snippets_status ON staged_snippets(status);
CREATE INDEX IF NOT EXISTS idx_staged_snippets_type ON staged_snippets(snippet_type);
CREATE INDEX IF NOT EXISTS idx_staged_snippets_campaign_status ON staged_snippets(campaign_id, status);
