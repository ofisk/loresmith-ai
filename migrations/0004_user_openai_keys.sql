-- Migration: Add user_openai_keys table for storing OpenAI API keys
-- Created: 2024-12-28

CREATE TABLE IF NOT EXISTS user_openai_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups by username
CREATE INDEX IF NOT EXISTS idx_user_openai_keys_username ON user_openai_keys(username); 