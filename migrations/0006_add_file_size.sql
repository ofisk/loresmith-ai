-- Add file_size column to pdf_files table
-- This column stores the file size in bytes for statistics calculation

ALTER TABLE pdf_files ADD COLUMN file_size INTEGER DEFAULT 0; 