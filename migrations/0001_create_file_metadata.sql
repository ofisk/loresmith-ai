-- create file_metadata table for storing file information
create table if not exists file_metadata (
  id text primary key,
  file_key text not null,
  user_id text not null,
  filename text not null,
  file_size integer not null,
  content_type text not null,
  description text,
  tags text not null default '[]',
  status text not null default 'uploaded',
  created_at text not null,
  updated_at text not null,
  vector_id text
);

-- create indexes for efficient querying
create index if not exists idx_file_metadata_user_id 
  on file_metadata(user_id);
create index if not exists idx_file_metadata_status 
  on file_metadata(status);
create index if not exists idx_file_metadata_created_at 
  on file_metadata(created_at);
create index if not exists idx_file_metadata_filename 
  on file_metadata(filename);
create index if not exists idx_file_metadata_tags 
  on file_metadata(tags);

-- create full-text search index for search functionality
create virtual table if not exists file_metadata_fts using fts5(
  filename,
  description,
  tags,
  content='file_metadata',
  content_rowid='rowid'
);

-- create triggers to keep fts index in sync
create trigger if not exists file_metadata_ai after insert 
  on file_metadata begin
  insert into file_metadata_fts(rowid, filename, description, tags) 
  values (new.rowid, new.filename, new.description, new.tags);
end;

create trigger if not exists file_metadata_ad after delete 
  on file_metadata begin
  insert into file_metadata_fts(file_metadata_fts, rowid, filename, description, tags) 
  values('delete', old.rowid, old.filename, old.description, old.tags);
end;

create trigger if not exists file_metadata_au after update 
  on file_metadata begin
  insert into file_metadata_fts(file_metadata_fts, rowid, filename, description, tags) 
  values('delete', old.rowid, old.filename, old.description, old.tags);
  insert into file_metadata_fts(rowid, filename, description, tags) 
  values (new.rowid, new.filename, new.description, new.tags);
end; 