-- Add unique constraint to prevent duplicate file_key entries
-- This ensures that each file can only be added once per user

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_files_unique_file_key 
ON pdf_files (file_key, username); 