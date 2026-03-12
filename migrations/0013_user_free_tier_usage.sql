-- Cumulative token usage for free-tier one-time trial; never resets.
CREATE TABLE IF NOT EXISTS user_free_tier_usage (
  username text primary key,
  tokens_used integer not null default 0,
  updated_at datetime default current_timestamp,
  foreign key (username) references users(username) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_user_free_tier_usage_username ON user_free_tier_usage(username);
