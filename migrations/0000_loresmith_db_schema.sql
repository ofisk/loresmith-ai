-- Initial schema for LoreSmith campaigns and RAG functionality

-- Campaigns table (replacing KV storage)
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  metadata TEXT, -- JSON metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Campaign resources (PDFs associated with campaigns)
CREATE TABLE campaign_resources (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- JSON array
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- PDF content chunks for RAG
CREATE TABLE pdf_chunks (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  username TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding_id TEXT, -- Vectorize ID (nullable for now)
  metadata TEXT, -- JSON metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PDF metadata for search
CREATE TABLE pdf_metadata (
  file_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- JSON array
  file_size INTEGER,
  status TEXT DEFAULT 'uploaded',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Search indexes
CREATE INDEX idx_campaigns_username ON campaigns(username);
CREATE INDEX idx_campaign_resources_campaign_id ON campaign_resources(campaign_id);
CREATE INDEX idx_campaign_resources_file_key ON campaign_resources(file_key);
CREATE INDEX idx_pdf_chunks_username ON pdf_chunks(username);
CREATE INDEX idx_pdf_chunks_file_key ON pdf_chunks(file_key);
CREATE INDEX idx_pdf_metadata_username ON pdf_metadata(username); 