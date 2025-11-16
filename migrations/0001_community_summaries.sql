-- Create community_summaries table for storing hierarchical community summaries
CREATE TABLE IF NOT EXISTS community_summaries (
  id text primary key,
  community_id text not null,
  level integer not null,
  summary_text text not null,
  key_entities text, -- JSON array of key entity IDs
  metadata text, -- JSON for additional context
  generated_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (community_id) references communities(id) on delete cascade
);

-- Create indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_summaries_community ON community_summaries(community_id);
CREATE INDEX IF NOT EXISTS idx_summaries_level ON community_summaries(level);

