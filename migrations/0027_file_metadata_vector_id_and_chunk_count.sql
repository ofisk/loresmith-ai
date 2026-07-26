-- Add file_metadata.vector_id and file_metadata.chunk_count.
--
-- persistFileTextChunks() (src/services/file/file-chunk-persistence.ts) always
-- writes chunk_count, and vector_id whenever the caller supplies one, via
-- FileDAO.updateFileMetadata(). Both columns are declared on the FileMetadata
-- interface, but neither existed in the hosted databases *or* in
-- scripts/d1/d1-bootstrap.sql -- so unlike migration 0026 this was never drift:
-- the columns were simply never created anywhere, and the write failed on every
-- install.
--
-- Symptom, straight from the production logs once logging was restored:
--
--   D1_ERROR: no such column: chunk_count: SQLITE_ERROR
--     at _FileDAO.updateFileMetadata
--     at persistFileTextChunks
--     at LibraryRAGService.processFile
--     at SyncQueueService.processSyncQueue
--
-- The failure lands *after* replaceFileChunks() has already stored the chunks,
-- so indexing does all its real work and then dies on the bookkeeping update,
-- leaving the file stuck in 'syncing' with its chunks orphaned.
--
-- Both columns are nullable, matching their optional declarations on
-- FileMetadata; existing rows keep NULL until their next successful indexing
-- pass. d1-bootstrap.sql is updated in the same commit so fresh installs get
-- them at CREATE TABLE time and skip this file via the journal baseline.

ALTER TABLE file_metadata ADD COLUMN vector_id text;
ALTER TABLE file_metadata ADD COLUMN chunk_count integer;
