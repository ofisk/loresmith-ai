-- Clean slate migration - drops all tables and recreates the entire database structure
-- This replaces all the previous migrations with a single, clean schema

-- Drop all existing tables (in dependency order)
DROP TABLE IF EXISTS autorag_chunks;
DROP TABLE IF EXISTS campaign_resources;
DROP TABLE IF EXISTS campaign_context_chunks;
DROP TABLE IF EXISTS campaign_characters;
DROP TABLE IF EXISTS campaign_context;
DROP TABLE IF EXISTS campaign_planning_sessions;
DROP TABLE IF EXISTS character_sheets;
DROP TABLE IF EXISTS user_notifications;
DROP TABLE IF EXISTS user_openai_keys;
DROP TABLE IF EXISTS file_chunks;
DROP TABLE IF EXISTS file_metadata;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS campaigns;

-- Create campaigns table
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  metadata TEXT, -- json metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create campaign resources (files associated with campaigns)
CREATE TABLE campaign_resources (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- json array
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Create file metadata for search (main file storage)
CREATE TABLE file_metadata (
  file_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- json array
  file_size INTEGER,
  status TEXT DEFAULT 'uploaded',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create file content chunks for rag
CREATE TABLE file_chunks (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  username TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding_id TEXT, -- vectorize id (nullable for now)
  metadata TEXT, -- json metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create autorag_chunks table for storing chunk metadata
CREATE TABLE autorag_chunks (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  username TEXT NOT NULL,
  chunk_key TEXT NOT NULL,
  part_number INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create campaign context table
CREATE TABLE campaign_context (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  context_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT, -- json metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Create campaign characters table
CREATE TABLE campaign_characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  character_data TEXT NOT NULL, -- json string containing character info
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Create campaign planning sessions table
CREATE TABLE campaign_planning_sessions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  session_type TEXT NOT NULL,
  session_data TEXT NOT NULL, -- json string containing session info
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Create campaign context chunks table
CREATE TABLE campaign_context_chunks (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding_id TEXT, -- vectorize id (nullable for now)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (context_id) REFERENCES campaign_context(id) ON DELETE CASCADE
);

-- Create character sheets table
CREATE TABLE character_sheets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  character_data TEXT NOT NULL, -- json string containing character sheet data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Create user OpenAI keys table
CREATE TABLE user_openai_keys (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create user notifications table
CREATE TABLE user_notifications (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create all indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_username ON campaigns(username);
CREATE INDEX IF NOT EXISTS idx_campaign_resources_campaign_id ON campaign_resources(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_resources_file_key ON campaign_resources(file_key);
CREATE INDEX IF NOT EXISTS idx_file_chunks_username ON file_chunks(username);
CREATE INDEX IF NOT EXISTS idx_file_chunks_file_key ON file_chunks(file_key);
CREATE INDEX IF NOT EXISTS idx_file_metadata_username ON file_metadata(username);
CREATE INDEX IF NOT EXISTS idx_autorag_chunks_file_key ON autorag_chunks(file_key);
CREATE INDEX IF NOT EXISTS idx_autorag_chunks_username ON autorag_chunks(username);
CREATE INDEX IF NOT EXISTS idx_autorag_chunks_chunk_key ON autorag_chunks(chunk_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_autorag_chunks_unique_chunk ON autorag_chunks(file_key, part_number);
CREATE INDEX IF NOT EXISTS idx_campaign_context_campaign_id ON campaign_context(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_characters_campaign_id ON campaign_characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_planning_sessions_campaign_id ON campaign_planning_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_context_chunks_context_id ON campaign_context_chunks(context_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_campaign_id ON character_sheets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_username ON user_notifications(username);
