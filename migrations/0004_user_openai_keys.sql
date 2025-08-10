-- migration: add user_openai_keys table for storing openai api keys
-- created: 2024-12-28

create table if not exists user_openai_keys (
    id integer primary key autoincrement,
    username text not null unique,
    api_key text not null,
    created_at datetime not null default current_timestamp,
    updated_at datetime not null default current_timestamp
);

-- create index for faster lookups by username
create index if not exists idx_user_openai_keys_username 
  on user_openai_keys(username); 