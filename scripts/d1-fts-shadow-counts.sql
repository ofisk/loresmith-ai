-- Optional: only when file_metadata_fts (FTS5) was created; otherwise "no such table: file_metadata_fts".
-- Same wrangler d1 execute ... --file as d1-cleanup-candidate-counts.sql
SELECT
  (SELECT COUNT(*) FROM file_metadata_fts) AS file_metadata_fts,
  (SELECT COUNT(*) FROM file_metadata_fts_config) AS file_metadata_fts_config,
  (SELECT COUNT(*) FROM file_metadata_fts_data) AS file_metadata_fts_data,
  (SELECT COUNT(*) FROM file_metadata_fts_docsize) AS file_metadata_fts_docsize,
  (SELECT COUNT(*) FROM file_metadata_fts_idx) AS file_metadata_fts_idx;
