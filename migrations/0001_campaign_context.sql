-- Migration to add campaign context and character information storage
-- This enables the campaign planner to store and retrieve context for intelligent suggestions

-- Campaign context table for storing text-based campaign information
CREATE TABLE IF NOT EXISTS campaign_context (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  context_type TEXT NOT NULL, -- 'character_backstory', 'world_description', 'campaign_notes', 'session_notes', etc.
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT, -- JSON metadata for additional context
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Character information table for storing player character details
CREATE TABLE IF NOT EXISTS campaign_characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  character_class TEXT,
  character_level INTEGER DEFAULT 1,
  character_race TEXT,
  backstory TEXT,
  personality_traits TEXT,
  goals TEXT,
  relationships TEXT, -- JSON array of relationships with other characters/NPCs
  metadata TEXT, -- JSON metadata for additional character info
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Campaign planning sessions table for tracking planning conversations
CREATE TABLE IF NOT EXISTS campaign_planning_sessions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  session_type TEXT NOT NULL, -- 'initial_setup', 'character_creation', 'session_planning', 'world_building', etc.
  summary TEXT,
  key_decisions TEXT, -- JSON array of key decisions made
  next_steps TEXT, -- JSON array of next steps identified
  resource_suggestions TEXT, -- JSON array of suggested resources
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Campaign context chunks for RAG (similar to pdf_chunks but for campaign context)
CREATE TABLE IF NOT EXISTS campaign_context_chunks (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  context_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding_id TEXT, -- Vectorize ID for similarity search
  metadata TEXT, -- JSON metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (context_id) REFERENCES campaign_context(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_campaign_context_campaign_id ON campaign_context(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_context_type ON campaign_context(context_type);
CREATE INDEX IF NOT EXISTS idx_campaign_characters_campaign_id ON campaign_characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_planning_sessions_campaign_id ON campaign_planning_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_context_chunks_campaign_id ON campaign_context_chunks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_context_chunks_context_id ON campaign_context_chunks(context_id); 