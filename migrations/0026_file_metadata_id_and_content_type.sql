-- Restore the `id` and `content_type` columns on file_metadata for hosted databases.
--
-- Both prod (loresmith-db) and dev (loresmith-db-dev) predate scripts/d1/d1-bootstrap.sql
-- and never received these two columns. Since PR #677 (2026-05-11) FileDAO names both of
-- them in every file_metadata INSERT (insertFileForProcessing, createFileMetadata,
-- createFileRecord), so the INSERT failed with "no such column: id" on those databases.
--
-- handleDirectUpload swallowed that failure ("don't fail the upload if metadata insertion
-- fails"), so the file landed in R2, processing continued, and the upload then died two
-- layers downstream in SyncQueueService.processFileUpload with the misleading
-- "File metadata not found in database". Net effect: every library upload has failed
-- since 2026-05-11.
--
-- Bootstrap declares `id text not null unique` and `content_type text not null default ''`.
-- SQLite cannot ALTER TABLE ADD a UNIQUE column, so `id` is added nullable, backfilled from
-- file_key (every DAO insert already passes file_key as the id), then given a unique index.
--
-- Fresh installs never run this file: d1-seed-d1-migrations.mjs baselines d1_migrations
-- immediately after d1-bootstrap.sql, which already creates both columns.

ALTER TABLE file_metadata ADD COLUMN id text;
ALTER TABLE file_metadata ADD COLUMN content_type text NOT NULL DEFAULT '';

UPDATE file_metadata SET id = file_key WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_metadata_id ON file_metadata (id);
