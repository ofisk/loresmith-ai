-- add pdf_files table for rag and pdf functionality
-- this table is used by the rag and pdf routes for file management

create table if not exists pdf_files (
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

-- create indexes for pdf_files table
create index if not exists idx_pdf_files_username 
  on pdf_files(username);
create index if not exists idx_pdf_files_file_key 
  on pdf_files(file_key);
create index if not exists idx_pdf_files_status 
  on pdf_files(status); 