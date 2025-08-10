-- add unique constraint to prevent duplicate file_key entries
-- this ensures that each file can only be added once per user

create unique index if not exists idx_pdf_files_unique_file_key 
  on pdf_files (file_key, username); 