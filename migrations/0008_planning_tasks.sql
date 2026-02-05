-- Migration 0008: Create planning_tasks table
-- Stores agent- and user-defined planning tasks for a campaign,
-- along with status and optional linkage to captured context.

CREATE TABLE IF NOT EXISTS planning_tasks (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'superseded')),
  source_message_id TEXT,
  linked_shard_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_planning_tasks_campaign ON planning_tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_status ON planning_tasks(status);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_created_at ON planning_tasks(created_at);

