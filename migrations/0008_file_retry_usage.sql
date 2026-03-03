-- Per-file retry usage for indexation/entity extraction retry limits
-- retry_date format: YYYY-MM-DD for daily rollups; monthly = sum across dates in month
CREATE TABLE IF NOT EXISTS file_retry_usage (
  username text not null,
  file_key text not null,
  retry_date text not null,
  retry_count integer not null default 0,
  updated_at datetime default current_timestamp,
  primary key (username, file_key, retry_date)
);

CREATE INDEX IF NOT EXISTS idx_file_retry_usage_lookup ON file_retry_usage(username, file_key);
