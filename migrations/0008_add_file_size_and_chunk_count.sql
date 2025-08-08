-- Add file_size and chunk_count columns to pdf_files table
-- These columns are needed for the new upload system that creates AutoRAG parts

ALTER TABLE pdf_files ADD COLUMN file_size INTEGER DEFAULT 0;
ALTER TABLE pdf_files ADD COLUMN chunk_count INTEGER DEFAULT NULL;
