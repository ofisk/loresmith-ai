-- Add display_name column to file_metadata table
-- This stores the auto-generated pretty name separately from the original filename
ALTER TABLE file_metadata ADD COLUMN display_name text;

