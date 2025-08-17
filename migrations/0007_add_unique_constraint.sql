-- add unique constraint to prevent duplicate file_key entries
-- this ensures that each file can only be added once per user

create unique index if not exists idx_files_unique_file_key 
  on files (file_key, username); 