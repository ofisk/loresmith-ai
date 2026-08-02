-- D1 bootstrap: full current schema (tables, indexes, view) for new databases.
-- d1-bootstrap.sh runs this, then seeds d1_migrations so wrangler only applies newer migrations.
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
  game_system text not null default 'generic',
  game_system_version text,
  pc_claim_requires_gm_approval integer not null default 0,
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
  entity_copy_status text not null default 'complete'
    check (entity_copy_status in ('complete', 'pending_library', 'failed')),
  pending_attribution text,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_campaign_resources_entity_copy
  ON campaign_resources(campaign_id, entity_copy_status);

-- Campaign members, share links, resource proposals (0001)
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id text not null,
  username text not null,
  role text not null check (role in ('editor_gm', 'readonly_gm', 'editor_player', 'readonly_player')),
  invited_by text not null,
  created_at datetime default current_timestamp,
  primary key (campaign_id, username),
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_campaign_members_username ON campaign_members(username);

CREATE TABLE IF NOT EXISTS campaign_share_links (
  token text primary key,
  campaign_id text not null,
  role text not null check (role in ('editor_gm', 'readonly_gm', 'editor_player', 'readonly_player')),
  created_by text not null,
  expires_at datetime,
  max_uses integer,
  use_count integer not null default 0,
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_campaign_share_links_campaign_id ON campaign_share_links(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_resource_proposals (
  id text primary key,
  campaign_id text not null,
  file_key text not null,
  file_name text not null,
  proposed_by text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at datetime,
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_campaign_resource_proposals_campaign_id ON campaign_resource_proposals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_resource_proposals_proposed_by ON campaign_resource_proposals(proposed_by);

-- Create file metadata for search (main file storage)
CREATE TABLE IF NOT EXISTS file_metadata (
  file_key text primary key,
  id text not null unique,
  username text not null,
  file_name text not null,
  display_name text, -- Auto-generated pretty name
  description text,
  tags text, -- json array
  file_size integer,
  content_type text not null default '',
  status text default 'uploaded',
  vector_id text, -- Vectorize id for the file's embeddings; set by persistFileTextChunks()
  chunk_count integer, -- Number of RAG chunks stored for the file; set by persistFileTextChunks()
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
  shard_status text, -- shard pipeline state (migration 0006 is backfill/index-only for idempotency)
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Player character sheets may store onboarding state in metadata JSON:
-- metadata.pcOnboardingStatus = 'incomplete' | 'complete' (see player-character-onboarding.ts)

-- Backfill shard_status on entities where null (0006)
UPDATE entities
SET shard_status = COALESCE(
  json_extract(metadata, '$.shardStatus'),
  'approved'
)
WHERE shard_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_entities_campaign_source
  ON entities(campaign_id, source_id);

CREATE INDEX IF NOT EXISTS idx_entities_campaign_shard_status_updated
  ON entities(campaign_id, shard_status, updated_at DESC);

-- Dirty tracking for incremental graph rebuilds (0005)
CREATE TABLE IF NOT EXISTS graph_dirty_entities (
  campaign_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  dirty_reason TEXT,
  marked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, entity_id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_dirty_entities_campaign_marked
  ON graph_dirty_entities(campaign_id, marked_at);

CREATE TABLE IF NOT EXISTS graph_dirty_relationships (
  campaign_id TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  dirty_reason TEXT,
  marked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, from_entity_id, to_entity_id, relationship_type),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_dirty_relationships_campaign_marked
  ON graph_dirty_relationships(campaign_id, marked_at);

CREATE INDEX IF NOT EXISTS idx_graph_dirty_relationships_campaign_from
  ON graph_dirty_relationships(campaign_id, from_entity_id);

CREATE INDEX IF NOT EXISTS idx_graph_dirty_relationships_campaign_to
  ON graph_dirty_relationships(campaign_id, to_entity_id);

CREATE TABLE IF NOT EXISTS graph_rebuild_job_dedupe (
  campaign_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  rebuild_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  last_rebuild_id TEXT,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, idempotency_key),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_rebuild_job_dedupe_campaign_status
  ON graph_rebuild_job_dedupe(campaign_id, status);

-- Player character claims (0004 + 0019)
CREATE TABLE IF NOT EXISTS campaign_player_character_claims (
  campaign_id TEXT NOT NULL,
  username TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  claim_status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, username),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_claims_campaign_entity
  ON campaign_player_character_claims(campaign_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_pc_claims_campaign_username
  ON campaign_player_character_claims(campaign_id, username);

-- Normalize legacy player character entity types (0018)
UPDATE entities SET entity_type = 'pcs' WHERE lower(entity_type) = 'pc';

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

-- Create character sheets table (matches CharacterSheetDAO; migration 0023 is a no-op on hosted D1)
CREATE TABLE IF NOT EXISTS character_sheets (
  id text primary key,
  campaign_id text not null,
  character_name text not null,
  character_data text not null default '{}',
  character_class text,
  character_level integer,
  character_race text,
  file_name text,
  file_content text,
  file_size integer,
  processed_data text,
  processed_at text,
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
CREATE INDEX IF NOT EXISTS idx_planning_tasks_campaign_status_session ON planning_tasks(campaign_id, status, target_session_number);

-- Library entity discovery (0020 + 0022): one extraction per library file, copied to campaigns on add
CREATE TABLE IF NOT EXISTS library_entity_discovery (
  file_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  content_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  queue_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT,
  support_escalated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (file_key) REFERENCES file_metadata(file_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_library_entity_discovery_status ON library_entity_discovery(status);
CREATE INDEX IF NOT EXISTS idx_library_entity_discovery_username ON library_entity_discovery(username);

CREATE TABLE IF NOT EXISTS library_entity_candidates (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  username TEXT NOT NULL,
  merge_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT,
  metadata TEXT,
  confidence REAL,
  extraction_entity_id TEXT NOT NULL,
  id_suffix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (file_key) REFERENCES file_metadata(file_key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_entity_candidates_file_merge
  ON library_entity_candidates(file_key, merge_key);

CREATE INDEX IF NOT EXISTS idx_library_entity_candidates_file_key ON library_entity_candidates(file_key);

CREATE TABLE IF NOT EXISTS library_entity_relationships (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  from_extraction_entity_id TEXT NOT NULL,
  to_extraction_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength REAL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (file_key) REFERENCES file_metadata(file_key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_entity_rel_file_endpoints
  ON library_entity_relationships(file_key, from_extraction_entity_id, to_extraction_entity_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_library_entity_rel_file_key ON library_entity_relationships(file_key);

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

-- One-time indexing credits (0009) - extends free-tier monthly token cap
CREATE TABLE IF NOT EXISTS user_indexing_credits (
  username text primary key,
  tokens_remaining integer not null default 0,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (username) references users(username) on delete cascade
);
CREATE INDEX IF NOT EXISTS idx_user_indexing_credits_username ON user_indexing_credits(username);

-- Subscriptions and monthly usage (0007)
CREATE TABLE IF NOT EXISTS subscriptions (
  id text primary key,
  username text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text not null default 'free' check (tier in ('free', 'basic', 'pro')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired')),
  current_period_end datetime,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (username) references users(username) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_username ON subscriptions(username);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS user_monthly_usage (
  username text not null,
  year_month text not null,
  tokens integer not null default 0,
  updated_at datetime default current_timestamp,
  primary key (username, year_month)
);

CREATE INDEX IF NOT EXISTS idx_user_monthly_usage_username ON user_monthly_usage(username);

-- LLM usage log (0003)
CREATE TABLE IF NOT EXISTS llm_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  query_count INTEGER NOT NULL DEFAULT 1,
  model TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_username_time
  ON llm_usage_log(username, created_at);

-- File retry usage (0008)
CREATE TABLE IF NOT EXISTS file_retry_usage (
  username text not null,
  file_key text not null,
  retry_date text not null,
  retry_count integer not null default 0,
  updated_at datetime default current_timestamp,
  primary key (username, file_key, retry_date)
);

CREATE INDEX IF NOT EXISTS idx_file_retry_usage_lookup ON file_retry_usage(username, file_key);

-- Resource add log (0011)
CREATE TABLE IF NOT EXISTS resource_add_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resource_add_log_lookup
  ON resource_add_log(username, campaign_id, created_at);

-- Entity search cache version (0012)
CREATE TABLE IF NOT EXISTS entity_search_cache_version (
  campaign_id TEXT PRIMARY KEY,
  cache_version INTEGER NOT NULL DEFAULT 0
);

-- Free-tier cumulative usage (0013)
CREATE TABLE IF NOT EXISTS user_free_tier_usage (
  username text primary key,
  tokens_used integer not null default 0,
  updated_at datetime default current_timestamp,
  foreign key (username) references users(username) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_user_free_tier_usage_username ON user_free_tier_usage(username);

-- Session plan readouts (0010, 0016)
CREATE TABLE IF NOT EXISTS campaign_session_plan_readouts (
  campaign_id TEXT NOT NULL,
  next_session_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT current_timestamp,
  updated_at DATETIME DEFAULT current_timestamp,
  PRIMARY KEY (campaign_id, next_session_number),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaign_session_plan_readout_chunks (
  campaign_id TEXT NOT NULL,
  next_session_number INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  steps_json TEXT NOT NULL,
  created_at DATETIME DEFAULT current_timestamp,
  PRIMARY KEY (campaign_id, next_session_number, chunk_index),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Performance indexes (0014; excludes legacy entity_extraction_queue)
CREATE INDEX IF NOT EXISTS idx_entity_relationships_from ON entity_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_to ON entity_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_campaign_type ON entity_relationships(campaign_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_file_metadata_username ON file_metadata(username);
CREATE INDEX IF NOT EXISTS idx_file_metadata_username_status ON file_metadata(username, status);
CREATE INDEX IF NOT EXISTS idx_file_metadata_status_updated ON file_metadata(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_campaigns_username ON campaigns(username);
CREATE INDEX IF NOT EXISTS idx_campaigns_username_updated ON campaigns(username, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_resources_campaign ON campaign_resources(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_resources_campaign_file ON campaign_resources(campaign_id, file_key);

CREATE INDEX IF NOT EXISTS idx_shard_registry_campaign ON shard_registry(campaign_id);
CREATE INDEX IF NOT EXISTS idx_shard_registry_resource ON shard_registry(resource_id);
CREATE INDEX IF NOT EXISTS idx_shard_registry_campaign_status ON shard_registry(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_communities_campaign ON communities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_communities_parent ON communities(parent_community_id);

CREATE INDEX IF NOT EXISTS idx_entity_dedup_campaign_status ON entity_deduplication_pending(campaign_id, status);

-- Campaign continuity checker findings and scan watermark (0029)
CREATE TABLE IF NOT EXISTS continuity_findings (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK (finding_type IN (
    'state_contradiction',
    'timeline_contradiction',
    'relationship_contradiction',
    'rules_contradiction',
    'dangling_thread'
  )),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  question TEXT NOT NULL,
  detail TEXT,
  evidence TEXT NOT NULL, -- JSON array of ContinuityEvidence (both sides, always)
  subject_entity_id TEXT,
  subject_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'confirmed',
    'dismissed',
    'corrected'
  )),
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at DATETIME,
  scan_id TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_continuity_findings_campaign_status
  ON continuity_findings(campaign_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_findings_campaign_type
  ON continuity_findings(campaign_id, finding_type);
CREATE INDEX IF NOT EXISTS idx_continuity_findings_scan
  ON continuity_findings(scan_id);

CREATE TABLE IF NOT EXISTS continuity_scan_state (
  campaign_id TEXT PRIMARY KEY,
  last_scanned_session INTEGER,
  last_scan_id TEXT,
  last_scan_mode TEXT,
  last_scan_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- LLM cost attribution (migration 0031): per-agent / per-intent spend.
-- Separate from llm_usage_log, which is the rate-limit ledger and is pruned
-- every 25 hours; this table is pruned on a 90-day horizon.
CREATE TABLE IF NOT EXISTS llm_cost_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  tier TEXT,
  intent TEXT NOT NULL,
  source TEXT,
  agent TEXT,
  model TEXT,
  provider TEXT,
  model_role TEXT,
  surface TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  query_count INTEGER NOT NULL DEFAULT 1,
  cost_usd REAL NOT NULL DEFAULT 0,
  priced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_cost_events_time
  ON llm_cost_events(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_cost_events_user_time
  ON llm_cost_events(username, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_cost_events_intent_time
  ON llm_cost_events(intent, created_at);

-- Anthropic Message Batches API for queue-driven pipeline work (issue #735)
--
-- A batch is submitted in one worker invocation and collected in a later one
-- (Anthropic allows up to 24h, a Worker invocation does not), so the in-flight
-- batch has to outlive the request that created it. One row per submitted batch.
--
-- `owner_kind` + `owner_key` identify the pipeline job the batch belongs to
-- (currently 'library_entity_discovery' + file_key). The UNIQUE index on
-- (owner_kind, owner_key) over non-terminal rows is what makes submission
-- single-flight: a second cron tick cannot submit a duplicate batch for a job
-- that already has one in flight.
--
-- `requests` is a JSON array of {customId, chunkIndex} — the mapping needed to
-- put an out-of-order batch result back on the right chunk. Batch results are
-- keyed by custom_id and arrive in arbitrary order, never by position.
CREATE TABLE IF NOT EXISTS llm_batch_jobs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_batch_id TEXT,
  owner_kind TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  username TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'submitting',
    'in_progress',
    'collected',
    'failed',
    'expired',
    'canceled'
  )),
  request_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  errored_count INTEGER NOT NULL DEFAULT 0,
  -- JSON array of {customId, chunkIndex}. Results are keyed by custom_id.
  requests TEXT NOT NULL,
  -- Guards against resuming a batch against different content: on collect, the
  -- caller re-derives this and falls back to inline extraction on mismatch.
  content_fingerprint TEXT,
  chunk_window_start INTEGER,
  chunk_window_end INTEGER,
  total_chunks INTEGER,
  -- Wall-clock deadline. Past it, the caller abandons the batch and falls back
  -- to the synchronous per-item path so indexing never wedges.
  deadline_at DATETIME NOT NULL,
  last_polled_at DATETIME,
  poll_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Single-flight per pipeline job: at most one non-terminal batch per owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_batch_jobs_owner_active
  ON llm_batch_jobs(owner_kind, owner_key)
  WHERE status IN ('submitting', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_status_created
  ON llm_batch_jobs(status, created_at);

-- Batch requests draw on a separate org budget line (batchRequestsPerMinute),
-- so the budget check sums request_count over a recent window.
CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_username_created
  ON llm_batch_jobs(username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_provider_batch_id
  ON llm_batch_jobs(provider_batch_id);

-- Session runsheets: one GM-facing, print-friendly page assembled from existing
-- campaign data. Runsheets are SNAPSHOTS, not live views: once generated the
-- content is frozen so the plan cannot shift under the GM mid-session.
CREATE TABLE IF NOT EXISTS campaign_runsheets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  session_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  -- JSON snapshot conforming to RunsheetData in src/types/runsheet.ts
  runsheet_data TEXT NOT NULL,
  generated_at DATETIME NOT NULL DEFAULT current_timestamp,
  created_at DATETIME NOT NULL DEFAULT current_timestamp,
  updated_at DATETIME NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Listing is always scoped to a campaign, newest session first.
CREATE INDEX IF NOT EXISTS idx_campaign_runsheets_campaign_session
  ON campaign_runsheets(campaign_id, session_number DESC);

-- Player-facing recap emails between sessions.
-- Opt-in is per campaign and defaults off; a missing row means "not enabled".
CREATE TABLE IF NOT EXISTS campaign_recap_settings (
  campaign_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- A recap email is always a draft first. status moves draft -> sent (or failed),
-- and never back: a sent recap cannot be edited or re-sent.
CREATE TABLE IF NOT EXISTS campaign_recap_emails (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  digest_id TEXT NOT NULL,
  session_number INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  next_session_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  created_by TEXT NOT NULL,
  sent_by TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- One recap per digest: regenerating replaces the existing draft rather than
-- creating a second one the GM could send twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recap_emails_digest
  ON campaign_recap_emails(digest_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recap_emails_campaign
  ON campaign_recap_emails(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_recap_deliveries (
  id TEXT PRIMARY KEY,
  recap_id TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (recap_id) REFERENCES campaign_recap_emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_recap_deliveries_recap
  ON campaign_recap_deliveries(recap_id);

-- One row per (campaign, player) once they have been mailed at least once.
-- unsubscribed_at NULL means subscribed; the token is stable so that older
-- emails keep working after a resubscribe.
CREATE TABLE IF NOT EXISTS campaign_recap_subscriptions (
  campaign_id TEXT NOT NULL,
  username TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL,
  unsubscribed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, username),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recap_subscriptions_token
  ON campaign_recap_subscriptions(unsubscribe_token);

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
-- Generated campaign audio: scene ambience, campaign theme music, and
-- creature/NPC vocalizations (issue #756).
--
-- The blob lives in R2 and only its key is stored here, matching the split in
-- docs/STORAGE_STRATEGY.md. Rows are written in `pending` before generation
-- starts, so a slow or failed provider call leaves a visible, explainable record
-- rather than nothing at all.
CREATE TABLE IF NOT EXISTS campaign_audio (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  -- ambience | music | creature | voice. Selects the provider, because Workers AI
  -- can serve the speech kinds today and cannot serve sound/music at all.
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  -- The prompt actually sent to the provider, stored verbatim so the GM can see
  -- which campaign context produced a track and regeneration is reproducible.
  prompt TEXT NOT NULL,
  -- R2 object key; NULL until generation succeeds.
  r2_key TEXT,
  content_type TEXT,
  duration_sec REAL,
  size_bytes INTEGER,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  loopable INTEGER NOT NULL DEFAULT 0,
  -- Where the prompt came from, so a track can be surfaced next to its scene on
  -- the session runsheet. JSON conforming to AudioSourceRef.
  source_kind TEXT,
  source_id TEXT,
  source_label TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT current_timestamp,
  updated_at DATETIME NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Listing is always scoped to a campaign, newest first.
CREATE INDEX IF NOT EXISTS idx_campaign_audio_campaign_created
  ON campaign_audio(campaign_id, created_at DESC);

-- The runsheet and the player both filter a campaign's tracks by kind.
CREATE INDEX IF NOT EXISTS idx_campaign_audio_campaign_kind
  ON campaign_audio(campaign_id, kind);

-- Attaching tracks to a runsheet scene looks up by source.
CREATE INDEX IF NOT EXISTS idx_campaign_audio_source
  ON campaign_audio(campaign_id, source_kind, source_id);
