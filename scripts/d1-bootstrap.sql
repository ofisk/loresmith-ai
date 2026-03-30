-- D1 bootstrap: base schema (tables, indexes, view)
-- Run once per new database. Run before wrangler d1 migrations apply.
-- Triggers are applied separately by d1-bootstrap.sh

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id text primary key,
  username text not null,
  name text not null,
  description text,
  status text default 'active',
  metadata text, -- json metadata
  campaignRagBasePath text, -- base path for campaign-specific RAG storage
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

-- Create campaign resources (files associated with campaigns)
CREATE TABLE IF NOT EXISTS campaign_resources (
  id text primary key,
  campaign_id text not null,
  file_key text not null,
  file_name text not null,
  description text,
  tags text, -- json array
  status text default 'active',
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create file metadata for search (main file storage)
CREATE TABLE IF NOT EXISTS file_metadata (
  file_key text primary key,
  username text not null,
  file_name text not null,
  display_name text, -- Auto-generated pretty name
  description text,
  tags text, -- json array
  file_size integer,
  status text default 'uploaded',
  content_summary text,
  key_topics text, -- JSON array of key topics/themes
  content_type_categories text, -- JSON array of content types e.g., ["map", "character", "adventure"]
  difficulty_level text, -- e.g., "beginner", "intermediate", "advanced"
  target_audience text, -- e.g., "players", "dms", "both"
  campaign_themes text, -- JSON array of campaign themes
  recommended_campaign_types text, -- JSON array of campaign types this resource fits
  content_quality_score integer, -- 1-10 score based on analysis
  last_analyzed_at datetime,
  analysis_status text default 'pending', -- pending, analyzing, completed, failed
  analysis_error text, -- Store any analysis errors
  processing_error text, -- Store processing error codes (e.g., MEMORY_LIMIT_EXCEEDED) to prevent infinite retries
  created_at datetime default current_timestamp,
  updated_at datetime
);

-- Create file content chunks for rag
CREATE TABLE IF NOT EXISTS file_chunks (
  id text primary key,
  file_key text not null,
  username text not null,
  chunk_text text not null,
  chunk_index integer not null,
  embedding_id text, -- vectorize id (nullable for now)
  metadata text, -- json metadata
  created_at datetime default current_timestamp
);

-- Create sync_queue table for managing file processing operations
CREATE TABLE IF NOT EXISTS sync_queue (
  id integer primary key autoincrement,
  username text not null,
  file_key text not null,
  file_name text not null,
  rag_id text not null,
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  retry_count integer not null default 0, -- Track retry attempts
  created_at datetime default current_timestamp,
  processed_at datetime,
  updated_at datetime
);

-- Track processing chunks for large files that exceed memory limits
CREATE TABLE IF NOT EXISTS file_processing_chunks (
  id text primary key,
  file_key text not null,
  username text not null,
  chunk_index integer not null,
  total_chunks integer not null,
  page_range_start integer, -- For PDFs: start page (1-based)
  page_range_end integer,   -- For PDFs: end page (1-based)
  byte_range_start integer, -- For non-PDFs: start byte
  byte_range_end integer,   -- For non-PDFs: end byte
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  vector_id text, -- Vectorize ID for this chunk
  error_message text,
  retry_count integer not null default 0,
  created_at datetime default current_timestamp,
  processed_at datetime,
  updated_at datetime,
  foreign key (file_key) references file_metadata(file_key) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_file_processing_chunks_file_key ON file_processing_chunks(file_key);
CREATE INDEX IF NOT EXISTS idx_file_processing_chunks_status ON file_processing_chunks(status);

-- Create shard_registry table for efficient shard tracking and lookup
-- Note: This is legacy - entities are now stored in the entities table, but keeping for backward compatibility
CREATE TABLE IF NOT EXISTS shard_registry (
  shard_id text primary key,
  campaign_id text not null,
  resource_id text not null,
  resource_name text not null,
  r2_key text not null,           -- Current R2 path (staging, approved, or rejected)
  shard_type text not null,       -- Entity type (spells, monsters, etc.)
  status text not null default 'staging',  -- 'staging', 'approved', 'rejected', 'deleted'
  confidence real,                -- Confidence score from AI extraction
  source text,                    -- Source system (e.g., 'library_rag_search')
  rejection_reason text,          -- Reason if rejected
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  deleted_at text,                -- Soft delete timestamp
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create entities table for storing extracted entities (GraphRAG)
CREATE TABLE IF NOT EXISTS entities (
  id text primary key,
  campaign_id text not null,
  entity_type text not null,
  name text not null,
  content text,
  metadata text,
  confidence real,
  source_type text,
  source_id text,
  embedding_id text,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create entity_relationships table (GraphRAG) - using final schema with from/to and strength
CREATE TABLE IF NOT EXISTS entity_relationships (
  id text primary key,
  campaign_id text not null,
  from_entity_id text not null,
  to_entity_id text not null,
  relationship_type text not null,
  strength real,
  metadata text,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade,
  foreign key (from_entity_id) references entities(id) on delete cascade,
  foreign key (to_entity_id) references entities(id) on delete cascade,
  unique(from_entity_id, to_entity_id, relationship_type)
);

-- Create entity_deduplication_pending table for tracking pending deduplication decisions
CREATE TABLE IF NOT EXISTS entity_deduplication_pending (
  id text primary key,
  campaign_id text not null,
  new_entity_id text not null,
  potential_duplicate_ids text not null,
  similarity_scores text not null,
  status text not null default 'pending',
  user_decision text,
  created_at datetime default current_timestamp,
  resolved_at datetime,
  foreign key (campaign_id) references campaigns(id) on delete cascade,
  foreign key (new_entity_id) references entities(id) on delete cascade
);

-- Create communities table for storing community detection results (Leiden algorithm)
CREATE TABLE IF NOT EXISTS communities (
  id text primary key,
  campaign_id text not null,
  level integer not null, -- Hierarchy level (0 = top level)
  parent_community_id text, -- Parent community in hierarchy
  entity_ids text not null, -- JSON array of entity IDs
  metadata text, -- JSON for community properties
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade,
  foreign key (parent_community_id) references communities(id) on delete set null
);

-- Create entity_importance table for storing precomputed centrality metrics
CREATE TABLE IF NOT EXISTS entity_importance (
  entity_id text primary key,
  campaign_id text not null,
  pagerank real not null,
  betweenness_centrality real not null,
  hierarchy_level integer not null,
  importance_score real not null, -- Composite score
  computed_at datetime default current_timestamp,
  foreign key (entity_id) references entities(id) on delete cascade,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_importance_campaign ON entity_importance(campaign_id);
CREATE INDEX IF NOT EXISTS idx_importance_score ON entity_importance(importance_score DESC);

-- Create community_summaries table for storing hierarchical community summaries
CREATE TABLE IF NOT EXISTS community_summaries (
  id text primary key,
  community_id text not null,
  level integer not null,
  summary_text text not null,
  key_entities text, -- JSON array of key entity IDs
  name text, -- Short AI-generated name (0004)
  metadata text, -- JSON for additional context
  generated_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (community_id) references communities(id) on delete cascade
);

-- Create indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_summaries_community ON community_summaries(community_id);
CREATE INDEX IF NOT EXISTS idx_summaries_level ON community_summaries(level);
CREATE INDEX IF NOT EXISTS idx_summaries_name ON community_summaries(name);

-- Join table for community-entity relationships (0006)
CREATE TABLE IF NOT EXISTS community_entities (
  community_id text not null,
  entity_id text not null,
  created_at datetime default current_timestamp,
  primary key (community_id, entity_id),
  foreign key (community_id) references communities(id) on delete cascade,
  foreign key (entity_id) references entities(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_community_entities_community_id ON community_entities(community_id);
CREATE INDEX IF NOT EXISTS idx_community_entities_entity_id ON community_entities(entity_id);

-- World state changelog table for tracking structural changes to entities,
-- relationships, and locations over time.
CREATE TABLE IF NOT EXISTS world_state_changelog (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  campaign_session_id INTEGER,
  timestamp DATETIME NOT NULL,
  changelog_data TEXT NOT NULL, -- JSON payload describing world changes
  impact_score REAL, -- Calculated impact for rebuild heuristics
  applied_to_graph BOOLEAN DEFAULT FALSE, -- Whether applied in last rebuild
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_changelog_campaign ON world_state_changelog(campaign_id);
CREATE INDEX IF NOT EXISTS idx_changelog_campaign_session ON world_state_changelog(campaign_session_id);
CREATE INDEX IF NOT EXISTS idx_changelog_timestamp ON world_state_changelog(timestamp);
CREATE INDEX IF NOT EXISTS idx_changelog_applied ON world_state_changelog(applied_to_graph);

-- Changelog archive metadata for tracking archived changelog entries in R2 (0001)
CREATE TABLE IF NOT EXISTS changelog_archive_metadata (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  rebuild_id TEXT NOT NULL,
  archive_key TEXT NOT NULL UNIQUE,
  session_range_min INTEGER,
  session_range_max INTEGER,
  timestamp_range_from DATETIME NOT NULL,
  timestamp_range_to DATETIME NOT NULL,
  entry_count INTEGER NOT NULL,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_archive_campaign ON changelog_archive_metadata(campaign_id);
CREATE INDEX IF NOT EXISTS idx_archive_rebuild ON changelog_archive_metadata(rebuild_id);
CREATE INDEX IF NOT EXISTS idx_archive_session_range ON changelog_archive_metadata(campaign_id, session_range_min, session_range_max);
CREATE INDEX IF NOT EXISTS idx_archive_timestamp_range ON changelog_archive_metadata(campaign_id, timestamp_range_from, timestamp_range_to);

-- Session digests table for storing high-level session recaps and planning information.
-- This table stores session digests that capture key events, state changes, and planning context.
-- 0002: status, quality_score, review_notes, generated_by_ai, template_id, source_type
CREATE TABLE IF NOT EXISTS session_digests (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  session_number INTEGER NOT NULL,
  session_date DATE,
  digest_data TEXT NOT NULL, -- JSON
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'approved', 'rejected')),
  quality_score REAL,
  review_notes TEXT,
  generated_by_ai INTEGER DEFAULT 0,
  template_id TEXT,
  source_type TEXT DEFAULT 'manual' CHECK(source_type IN ('manual', 'ai_generated')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE(campaign_id, session_number)
);

CREATE INDEX IF NOT EXISTS idx_digests_campaign ON session_digests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_digests_session ON session_digests(campaign_id, session_number);
CREATE INDEX IF NOT EXISTS idx_digests_date ON session_digests(session_date);
CREATE INDEX IF NOT EXISTS idx_digests_status ON session_digests(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_digests_template ON session_digests(template_id);
CREATE INDEX IF NOT EXISTS idx_digests_source_type ON session_digests(source_type);

-- Session digest templates for reusable digest templates (0002)
CREATE TABLE IF NOT EXISTS session_digest_templates (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template_data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_digest_templates_campaign ON session_digest_templates(campaign_id);

-- Rebuild status table for tracking graph rebuild operations.
-- This table stores rebuild status, progress, and metadata for full and partial rebuilds.
CREATE TABLE IF NOT EXISTS rebuild_status (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  rebuild_type TEXT NOT NULL CHECK (rebuild_type IN ('full', 'partial')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  affected_entity_ids TEXT, -- JSON array of affected entity IDs (for partial rebuilds)
  started_at DATETIME,
  completed_at DATETIME,
  error_message TEXT,
  metadata TEXT, -- JSON metadata for additional context (progress, performance metrics, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rebuild_status_campaign ON rebuild_status(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rebuild_status_status ON rebuild_status(status);
CREATE INDEX IF NOT EXISTS idx_rebuild_status_created ON rebuild_status(created_at);

-- GraphRAG Telemetry table for tracking query latency, changelog growth, rebuild metrics, and quality metrics.
CREATE TABLE IF NOT EXISTS graphrag_telemetry (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  metric_type TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metadata TEXT, -- JSON metadata for additional context
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_campaign ON graphrag_telemetry(campaign_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_type ON graphrag_telemetry(metric_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_date ON graphrag_telemetry(recorded_at);

-- Create campaign context table
CREATE TABLE IF NOT EXISTS campaign_context (
  id text primary key,
  campaign_id text not null,
  context_type text not null,
  title text not null,
  content text not null,
  metadata text, -- json metadata
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create campaign characters table
CREATE TABLE IF NOT EXISTS campaign_characters (
  id text primary key,
  campaign_id text not null,
  character_name text not null,
  character_data text not null, -- json string containing character info
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create campaign planning sessions table
CREATE TABLE IF NOT EXISTS campaign_planning_sessions (
  id text primary key,
  campaign_id text not null,
  session_type text not null,
  session_data text not null, -- json string containing session info
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create campaign context chunks table
CREATE TABLE IF NOT EXISTS campaign_context_chunks (
  id text primary key,
  context_id text not null,
  chunk_text text not null,
  chunk_index integer not null,
  embedding_id text, -- vectorize id (nullable for now)
  created_at datetime default current_timestamp,
  foreign key (context_id) references campaign_context(id) on delete cascade
);

-- Create character sheets table
CREATE TABLE IF NOT EXISTS character_sheets (
  id text primary key,
  campaign_id text not null,
  character_name text not null,
  character_data text not null, -- json string containing character sheet data
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Campaign checklist status (0007)
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

CREATE INDEX IF NOT EXISTS idx_checklist_status_campaign ON campaign_checklist_status(campaign_id);
CREATE INDEX IF NOT EXISTS idx_checklist_status_key ON campaign_checklist_status(checklist_item_key);
CREATE INDEX IF NOT EXISTS idx_checklist_status_status ON campaign_checklist_status(status);

-- Planning tasks (0008-0010)
CREATE TABLE IF NOT EXISTS planning_tasks (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'superseded')),
  completion_notes TEXT,
  target_session_number INTEGER,
  source_message_id TEXT,
  linked_shard_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_planning_tasks_campaign ON planning_tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_status ON planning_tasks(status);
CREATE INDEX IF NOT EXISTS idx_planning_tasks_created_at ON planning_tasks(created_at);

-- Entity extraction queue (0003)
CREATE TABLE IF NOT EXISTS entity_extraction_queue (
  id integer primary key autoincrement,
  username text not null,
  campaign_id text not null,
  resource_id text not null,
  resource_name text not null,
  file_key text,
  status text not null default 'pending',
  retry_count integer not null default 0,
  last_error text, -- migration 0017 renames to queue_message (run migrations after bootstrap)
  error_code text,
  next_retry_at datetime,
  created_at datetime default current_timestamp,
  processed_at datetime,
  updated_at datetime,
  UNIQUE(campaign_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status ON entity_extraction_queue(status);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_next_retry ON entity_extraction_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_campaign ON entity_extraction_queue(campaign_id);

-- Message history (0005)
CREATE TABLE IF NOT EXISTS message_history (
  id text primary key,
  session_id text not null,
  username text,
  campaign_id text,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  message_data text,
  created_at datetime default current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_message_history_session_id ON message_history(session_id);
CREATE INDEX IF NOT EXISTS idx_message_history_username ON message_history(username);
CREATE INDEX IF NOT EXISTS idx_message_history_campaign_id ON message_history(campaign_id);
CREATE INDEX IF NOT EXISTS idx_message_history_created_at ON message_history(created_at);
CREATE INDEX IF NOT EXISTS idx_message_history_role ON message_history(role);
CREATE INDEX IF NOT EXISTS idx_message_history_session_created ON message_history(session_id, created_at);

-- Users and email verification (0011, 0012)
CREATE TABLE IF NOT EXISTS users (
  id text primary key,
  username text not null unique,
  email text not null unique,
  password_hash text,
  email_verified_at datetime,
  auth_provider text not null default 'password',
  is_admin integer not null default 0,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token text primary key,
  username text not null,
  expires_at datetime not null,
  created_at datetime default current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_username ON email_verification_tokens(username);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Create user OpenAI keys table
CREATE TABLE IF NOT EXISTS user_openai_keys (
  id text primary key,
  username text not null unique,
  api_key text not null,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

-- Create user notifications table
CREATE TABLE IF NOT EXISTS user_notifications (
  id text primary key,
  username text not null,
  notification_type text not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at datetime default current_timestamp
);

-- One-time indexing credits (0009) - extends free-tier monthly token cap
CREATE TABLE IF NOT EXISTS user_indexing_credits (
  username text primary key,
  tokens_remaining integer not null default 0,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (username) references users(username) on delete cascade
);
CREATE INDEX IF NOT EXISTS idx_user_indexing_credits_username ON user_indexing_credits(username);

-- Create a view for easy querying of analyzed files
CREATE VIEW IF NOT EXISTS analyzed_files AS
select 
    file_key,
    username,
    file_name,
    description,
    tags,
    content_summary,
    key_topics,
    content_type_categories,
    difficulty_level,
    target_audience,
    campaign_themes,
    recommended_campaign_types,
    content_quality_score,
    created_at,
    last_analyzed_at
from file_metadata 
where analysis_status = 'completed' 
    and content_summary is not null;
