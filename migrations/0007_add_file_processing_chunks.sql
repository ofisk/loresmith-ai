-- Track processing chunks for large files that exceed memory limits
CREATE TABLE IF NOT EXISTS file_processing_chunks (
  id text primary key,
  file_key text not null,
  username text not null,
  chunk_index integer not null,
  total_chunks integer not null,
  page_range_start integer, -- For PDFs: start page (1-based)
  page_range_end integer,   -- For PDFs: end page (1-based)
  byte_range_start integer, -- For non-PDFs: start byte
  byte_range_end integer,   -- For non-PDFs: end byte
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  vector_id text, -- Vectorize ID for this chunk
  error_message text,
  retry_count integer not null default 0,
  created_at datetime default current_timestamp,
  processed_at datetime,
  updated_at datetime,
  foreign key (file_key) references file_metadata(file_key) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_file_processing_chunks_file_key ON file_processing_chunks(file_key);
CREATE INDEX IF NOT EXISTS idx_file_processing_chunks_status ON file_processing_chunks(status);

