-- One-time indexing credits: extends free-tier monthly token cap
CREATE TABLE IF NOT EXISTS user_indexing_credits (
  username text primary key,
  tokens_remaining integer not null default 0,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (username) references users(username) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_user_indexing_credits_username ON user_indexing_credits(username);
