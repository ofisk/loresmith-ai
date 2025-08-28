-- Clean slate migration - drops all tables and recreates the entire database structure
-- This replaces all the previous migrations with a single, clean schema

-- Drop all existing tables (in dependency order)
drop table if exists autorag_chunks;
drop table if exists campaign_resources;
drop table if exists campaign_context_chunks;
drop table if exists campaign_characters;
drop table if exists campaign_context;
drop table if exists campaign_planning_sessions;
drop table if exists character_sheets;
drop table if exists user_notifications;
drop table if exists user_openai_keys;
drop table if exists file_chunks;
drop table if exists file_metadata;
drop table if exists files;
drop table if exists campaigns;

-- Create campaigns table
create table campaigns (
  id text primary key,
  username text not null,
  name text not null,
  description text,
  status text default 'active',
  metadata text, -- json metadata
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

-- Create campaign resources (files associated with campaigns)
create table campaign_resources (
  id text primary key,
  campaign_id text not null,
  file_key text not null,
  file_name text not null,
  description text,
  tags text, -- json array
  status text default 'active',
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create file metadata for search (main file storage)
create table file_metadata (
  file_key text primary key,
  username text not null,
  file_name text not null,
  description text,
  tags text, -- json array
  file_size integer,
  status text default 'uploaded',
  created_at datetime default current_timestamp
);

-- Create file content chunks for rag
create table file_chunks (
  id text primary key,
  file_key text not null,
  username text not null,
  chunk_text text not null,
  chunk_index integer not null,
  embedding_id text, -- vectorize id (nullable for now)
  metadata text, -- json metadata
  created_at datetime default current_timestamp
);

-- Create autorag_chunks table for storing chunk metadata
create table autorag_chunks (
  id text primary key,
  file_key text not null,
  username text not null,
  chunk_key text not null,
  part_number integer not null,
  chunk_size integer not null,
  original_filename text not null,
  created_at datetime default current_timestamp
);

-- Create campaign context table
create table campaign_context (
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
create table campaign_characters (
  id text primary key,
  campaign_id text not null,
  character_name text not null,
  character_data text not null, -- json string containing character info
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create campaign planning sessions table
create table campaign_planning_sessions (
  id text primary key,
  campaign_id text not null,
  session_type text not null,
  session_data text not null, -- json string containing session info
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create campaign context chunks table
create table campaign_context_chunks (
  id text primary key,
  context_id text not null,
  chunk_text text not null,
  chunk_index integer not null,
  embedding_id text, -- vectorize id (nullable for now)
  created_at datetime default current_timestamp,
  foreign key (context_id) references campaign_context(id) on delete cascade
);

-- Create character sheets table
create table character_sheets (
  id text primary key,
  campaign_id text not null,
  character_name text not null,
  character_data text not null, -- json string containing character sheet data
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- Create user OpenAI keys table
create table user_openai_keys (
  id text primary key,
  username text not null unique,
  api_key text not null,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

-- Create user notifications table
create table user_notifications (
  id text primary key,
  username text not null,
  notification_type text not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at datetime default current_timestamp
);

-- Create all indexes
create index if not exists idx_campaigns_username on campaigns(username);
create index if not exists idx_campaign_resources_campaign_id on campaign_resources(campaign_id);
create index if not exists idx_campaign_resources_file_key on campaign_resources(file_key);
create index if not exists idx_file_chunks_username on file_chunks(username);
create index if not exists idx_file_chunks_file_key on file_chunks(file_key);
create index if not exists idx_file_metadata_username on file_metadata(username);
create index if not exists idx_autorag_chunks_file_key on autorag_chunks(file_key);
create index if not exists idx_autorag_chunks_username on autorag_chunks(username);
create index if not exists idx_autorag_chunks_chunk_key on autorag_chunks(chunk_key);
create unique index if not exists idx_autorag_chunks_unique_chunk on autorag_chunks(file_key, part_number);
create index if not exists idx_campaign_context_campaign_id on campaign_context(campaign_id);
create index if not exists idx_campaign_characters_campaign_id on campaign_characters(campaign_id);
create index if not exists idx_campaign_planning_sessions_campaign_id on campaign_planning_sessions(campaign_id);
create index if not exists idx_campaign_context_chunks_context_id on campaign_context_chunks(context_id);
create index if not exists idx_character_sheets_campaign_id on character_sheets(campaign_id);
create index if not exists idx_user_notifications_username on user_notifications(username);
