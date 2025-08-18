-- migration to add campaign context and character information storage
-- this enables the campaign planner to store and retrieve context for intelligent suggestions

-- campaign context table for storing text-based campaign information
create table if not exists campaign_context (
  id text primary key,
  campaign_id text not null,
  context_type text not null, -- 'character_backstory', 'world_description', 'campaign_notes', 'session_notes', etc.
  title text not null,
  content text not null,
  metadata text, -- json metadata for additional context
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- character information table for storing player character details
create table if not exists campaign_characters (
  id text primary key,
  campaign_id text not null,
  character_name text not null,
  character_class text,
  character_level integer default 1,
  character_race text,
  backstory text,
  personality_traits text,
  goals text,
  relationships text, -- json array of relationships with other characters/npcs
  metadata text, -- json metadata for additional character info
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- campaign planning sessions table for tracking planning conversations
create table if not exists campaign_planning_sessions (
  id text primary key,
  campaign_id text not null,
  session_type text not null, -- 'initial_setup', 'character_creation', 'session_planning', 'world_building', etc.
  summary text,
  key_decisions text, -- json array of key decisions made
  next_steps text, -- json array of next steps identified
  resource_suggestions text, -- json array of suggested resources
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- campaign context chunks for rag (similar to file_chunks but for campaign context)
create table if not exists campaign_context_chunks (
  id text primary key,
  campaign_id text not null,
  context_id text not null,
  chunk_text text not null,
  chunk_index integer not null,
  embedding_id text, -- vectorize id for similarity search
  metadata text, -- json metadata
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade,
  foreign key (context_id) references campaign_context(id) on delete cascade
);

-- indexes for efficient querying
create index if not exists idx_campaign_context_campaign_id 
  on campaign_context(campaign_id);
create index if not exists idx_campaign_context_type 
  on campaign_context(context_type);
create index if not exists idx_campaign_characters_campaign_id 
  on campaign_characters(campaign_id);
create index if not exists idx_campaign_planning_sessions_campaign_id 
  on campaign_planning_sessions(campaign_id);
create index if not exists idx_campaign_context_chunks_campaign_id 
  on campaign_context_chunks(campaign_id);
create index if not exists idx_campaign_context_chunks_context_id 
  on campaign_context_chunks(context_id); 