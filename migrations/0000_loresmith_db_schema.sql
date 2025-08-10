-- initial schema for loresmith campaigns and rag functionality

-- campaigns table (replacing kv storage)
create table if not exists campaigns (
  id text primary key,
  username text not null,
  name text not null,
  description text,
  status text default 'active',
  metadata text, -- json metadata
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

-- campaign resources (pdfs associated with campaigns)
create table if not exists campaign_resources (
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

-- pdf content chunks for rag
create table if not exists pdf_chunks (
  id text primary key,
  file_key text not null,
  username text not null,
  chunk_text text not null,
  chunk_index integer not null,
  embedding_id text, -- vectorize id (nullable for now)
  metadata text, -- json metadata
  created_at datetime default current_timestamp
);

-- pdf metadata for search
create table if not exists pdf_metadata (
  file_key text primary key,
  username text not null,
  file_name text not null,
  description text,
  tags text, -- json array
  file_size integer,
  status text default 'uploaded',
  created_at datetime default current_timestamp
);

-- search indexes
create index if not exists idx_campaigns_username 
  on campaigns(username);
create index if not exists idx_campaign_resources_campaign_id 
  on campaign_resources(campaign_id);
create index if not exists idx_campaign_resources_file_key 
  on campaign_resources(file_key);
create index if not exists idx_pdf_chunks_username 
  on pdf_chunks(username);
create index if not exists idx_pdf_chunks_file_key 
  on pdf_chunks(file_key);
create index if not exists idx_pdf_metadata_username 
  on pdf_metadata(username); 