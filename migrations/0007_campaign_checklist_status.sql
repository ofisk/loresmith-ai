-- Migration 0007: Create campaign checklist status table
-- This stores structured status and summaries for campaign planning checklist items
-- This allows agents to quickly check what's been completed without expensive searches

-- Create campaign_checklist_status table
CREATE TABLE IF NOT EXISTS campaign_checklist_status (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  checklist_item_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'incomplete', 'partial')),
  summary TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE(campaign_id, checklist_item_key)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_checklist_status_campaign ON campaign_checklist_status(campaign_id);
CREATE INDEX IF NOT EXISTS idx_checklist_status_key ON campaign_checklist_status(checklist_item_key);
CREATE INDEX IF NOT EXISTS idx_checklist_status_status ON campaign_checklist_status(status);
