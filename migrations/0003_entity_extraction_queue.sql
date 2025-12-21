-- Entity extraction queue for managing entity extraction operations with rate limit handling
CREATE TABLE IF NOT EXISTS entity_extraction_queue (
  id integer primary key autoincrement,
  username text not null,
  campaign_id text not null,
  resource_id text not null,
  resource_name text not null,
  file_key text,
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed', 'rate_limited'
  retry_count integer not null default 0,
  last_error text,
  error_code text, -- 'RATE_LIMIT', 'MEMORY_LIMIT', etc.
  next_retry_at datetime, -- When to retry after rate limit backoff
  created_at datetime default current_timestamp,
  processed_at datetime,
  updated_at datetime,
  UNIQUE(campaign_id, resource_id) -- Prevent duplicate queue entries for same resource
);

CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status ON entity_extraction_queue(status);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_next_retry ON entity_extraction_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_campaign ON entity_extraction_queue(campaign_id);

