-- Create file_metadata table for storing file information
CREATE TABLE IF NOT EXISTS file_metadata (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  vector_id TEXT
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_file_metadata_user_id ON file_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_status ON file_metadata(status);
CREATE INDEX IF NOT EXISTS idx_file_metadata_created_at ON file_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_file_metadata_filename ON file_metadata(filename);
CREATE INDEX IF NOT EXISTS idx_file_metadata_tags ON file_metadata(tags);

-- Create full-text search index for search functionality
CREATE VIRTUAL TABLE IF NOT EXISTS file_metadata_fts USING fts5(
  filename,
  description,
  tags,
  content='file_metadata',
  content_rowid='rowid'
);

-- Create triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS file_metadata_ai AFTER INSERT ON file_metadata BEGIN
  INSERT INTO file_metadata_fts(rowid, filename, description, tags) 
  VALUES (new.rowid, new.filename, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS file_metadata_ad AFTER DELETE ON file_metadata BEGIN
  INSERT INTO file_metadata_fts(file_metadata_fts, rowid, filename, description, tags) 
  VALUES('delete', old.rowid, old.filename, old.description, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS file_metadata_au AFTER UPDATE ON file_metadata BEGIN
  INSERT INTO file_metadata_fts(file_metadata_fts, rowid, filename, description, tags) 
  VALUES('delete', old.rowid, old.filename, old.description, old.tags);
  INSERT INTO file_metadata_fts(rowid, filename, description, tags) 
  VALUES (new.rowid, new.filename, new.description, new.tags);
END; 