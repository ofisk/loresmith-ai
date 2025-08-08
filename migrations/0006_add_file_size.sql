-- Add file_size column to pdf_files table
-- This column stores the file size in bytes for statistics calculation

-- SQLite doesn't have ALTER TABLE IF NOT EXISTS, but this will fail gracefully if column exists
-- The migration system should handle the error and continue

ALTER TABLE pdf_files ADD COLUMN file_size INTEGER DEFAULT 0; 