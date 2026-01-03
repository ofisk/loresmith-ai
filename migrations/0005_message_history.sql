-- Create message_history table for storing chat messages persistently
CREATE TABLE IF NOT EXISTS message_history (
  id text primary key,
  session_id text not null,
  username text,
  campaign_id text,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  message_data text, -- JSON string of additional message data
  created_at datetime default current_timestamp
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_message_history_session_id ON message_history(session_id);
CREATE INDEX IF NOT EXISTS idx_message_history_username ON message_history(username);
CREATE INDEX IF NOT EXISTS idx_message_history_campaign_id ON message_history(campaign_id);
CREATE INDEX IF NOT EXISTS idx_message_history_created_at ON message_history(created_at);
CREATE INDEX IF NOT EXISTS idx_message_history_role ON message_history(role);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_message_history_session_created ON message_history(session_id, created_at);

