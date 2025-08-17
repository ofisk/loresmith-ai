-- add files table for rag and file functionality
-- this table is used by the rag and file routes for file management

create table if not exists files (
  id text primary key,
  file_key text not null,
  file_name text not null,
  description text,
  tags text, -- json array
  username text not null,
  status text default 'uploaded',
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

-- create indexes for files table
create index if not exists idx_files_username 
  on files(username);
create index if not exists idx_files_file_key 
  on files(file_key);
create index if not exists idx_files_status 
  on files(status); 