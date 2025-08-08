-- User Notifications Table
-- Stores pending notifications for users about completed file processing

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  username TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('file_processing_complete', 'file_processing_error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  file_key TEXT,
  file_name TEXT,
  metadata TEXT, -- JSON string for additional data
  is_read BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT,
  FOREIGN KEY (username) REFERENCES user_openai_keys(username) ON DELETE CASCADE
);

-- Index for efficient user notification queries
CREATE INDEX IF NOT EXISTS idx_user_notifications_username_unread 
ON user_notifications(username, is_read, created_at);

-- Index for cleanup of old notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at 
ON user_notifications(created_at);
