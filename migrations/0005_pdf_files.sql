-- Add pdf_files table for RAG and PDF functionality
-- This table is used by the RAG and PDF routes for file management

CREATE TABLE IF NOT EXISTS pdf_files (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- JSON array
  username TEXT NOT NULL,
  status TEXT DEFAULT 'uploaded',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for pdf_files table
CREATE INDEX IF NOT EXISTS idx_pdf_files_username ON pdf_files(username);
CREATE INDEX IF NOT EXISTS idx_pdf_files_file_key ON pdf_files(file_key);
CREATE INDEX IF NOT EXISTS idx_pdf_files_status ON pdf_files(status); 