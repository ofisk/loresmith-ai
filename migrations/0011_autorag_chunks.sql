-- add autorag_chunks table for storing chunk metadata
-- this table tracks which chunks belong to which original files

create table if not exists autorag_chunks (
  id text primary key,
  file_key text not null,
  username text not null,
  chunk_key text not null,
  part_number integer not null,
  chunk_size integer not null,
  original_filename text not null,
  created_at datetime default current_timestamp,
  foreign key (file_key) references pdf_files(file_key) on delete cascade
);

-- create indexes for autorag_chunks table
create index if not exists idx_autorag_chunks_file_key 
  on autorag_chunks(file_key);
create index if not exists idx_autorag_chunks_username 
  on autorag_chunks(username);
create index if not exists idx_autorag_chunks_chunk_key 
  on autorag_chunks(chunk_key);
create unique index if not exists idx_autorag_chunks_unique_chunk 
  on autorag_chunks(file_key, part_number);
