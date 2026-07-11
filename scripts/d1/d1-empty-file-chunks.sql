-- Files that look "done" but have zero rows in file_chunks (RAG repair candidates).
-- Filter by username — trigger-indexing JWT must own each file (no admin bypass).
--
-- Manual (prod remote):
--   npx wrangler d1 execute loresmith-db --config wrangler.jsonc --remote -y --json \
--     --command "SELECT fm.file_key, fm.file_name, fm.username, fm.status, fm.file_size FROM file_metadata fm WHERE fm.username = 'YOUR_USERNAME' AND fm.status IN ('completed', 'processed') AND NOT EXISTS (SELECT 1 FROM file_chunks fc WHERE fc.file_key = fm.file_key) ORDER BY fm.file_key;"
--
-- Prefer: npx tsx scripts/maintenance/retrigger-empty-file-chunks.ts --dry-run

SELECT
  fm.file_key,
  fm.file_name,
  fm.username,
  fm.status,
  fm.file_size
FROM file_metadata fm
WHERE fm.username = :username
  AND fm.status IN ('completed', 'processed')
  AND NOT EXISTS (
    SELECT 1 FROM file_chunks fc WHERE fc.file_key = fm.file_key
  )
ORDER BY fm.file_key;
