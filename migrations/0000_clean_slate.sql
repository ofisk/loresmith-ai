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
  created_at datetime default current_timestamp,
  processed_at datetime
);

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

CREATE INDEX idx_importance_campaign ON entity_importance(campaign_id);
CREATE INDEX idx_importance_score ON entity_importance(importance_score DESC);

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

-- Create all indexes
create index if not exists idx_campaigns_username on campaigns(username);
create index if not exists idx_campaigns_rag_base_path on campaigns(campaignRagBasePath);
create index if not exists idx_campaign_resources_campaign_id on campaign_resources(campaign_id);
create index if not exists idx_campaign_resources_file_key on campaign_resources(file_key);
create index if not exists idx_file_chunks_username on file_chunks(username);
create index if not exists idx_file_chunks_file_key on file_chunks(file_key);
create index if not exists idx_file_metadata_username on file_metadata(username);
create index if not exists idx_file_metadata_analysis_status on file_metadata(analysis_status);
create index if not exists idx_file_metadata_content_type_categories on file_metadata(content_type_categories);
create index if not exists idx_file_metadata_difficulty_level on file_metadata(difficulty_level);
create index if not exists idx_file_metadata_campaign_themes on file_metadata(campaign_themes);
create index if not exists idx_file_metadata_content_quality_score on file_metadata(content_quality_score);
create index if not exists idx_file_metadata_status_updated_at on file_metadata(status, updated_at);
create index if not exists idx_sync_queue_username on sync_queue(username);
create index if not exists idx_sync_queue_status on sync_queue(status);
create index if not exists idx_sync_queue_file_key on sync_queue(file_key);
create index if not exists idx_sync_queue_created_at on sync_queue(created_at);
create index if not exists idx_shard_registry_campaign_id on shard_registry(campaign_id);
create index if not exists idx_shard_registry_resource_id on shard_registry(resource_id);
create index if not exists idx_shard_registry_status on shard_registry(status);
create index if not exists idx_shard_registry_campaign_status on shard_registry(campaign_id, status);
create index if not exists idx_shard_registry_shard_type on shard_registry(shard_type);
create index if not exists idx_shard_registry_r2_key on shard_registry(r2_key);
create index if not exists idx_entities_campaign on entities(campaign_id);
create index if not exists idx_entities_campaign_type on entities(campaign_id, entity_type);
create index if not exists idx_entities_embedding on entities(embedding_id);
create index if not exists idx_entity_relationships_campaign on entity_relationships(campaign_id);
create index if not exists idx_relationships_from on entity_relationships(from_entity_id);
create index if not exists idx_relationships_to on entity_relationships(to_entity_id);
create index if not exists idx_relationships_type on entity_relationships(relationship_type);
create index if not exists idx_entity_dedup_campaign_status on entity_deduplication_pending(campaign_id, status);
create index if not exists idx_communities_campaign_level on communities(campaign_id, level);
create index if not exists idx_communities_parent on communities(parent_community_id);
create index if not exists idx_communities_campaign on communities(campaign_id);
create index if not exists idx_campaign_context_campaign_id on campaign_context(campaign_id);
create index if not exists idx_campaign_characters_campaign_id on campaign_characters(campaign_id);
create index if not exists idx_campaign_planning_sessions_campaign_id on campaign_planning_sessions(campaign_id);
create index if not exists idx_campaign_context_chunks_context_id on campaign_context_chunks(context_id);
create index if not exists idx_character_sheets_campaign_id on character_sheets(campaign_id);
create index if not exists idx_user_notifications_username on user_notifications(username);

-- Create triggers to update updated_at timestamps
create trigger if not exists update_shard_registry_timestamp 
    after update on shard_registry
    for each row
begin
    update shard_registry set updated_at = datetime('now') where shard_id = new.shard_id;
end;

create trigger if not exists trigger_entity_relationships_updated_at
    after update on entity_relationships
    for each row
begin
    update entity_relationships
    set updated_at = current_timestamp
    where id = new.id;
end;