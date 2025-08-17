-- add file_size and chunk_count columns to pdf_files table
-- these columns are needed for the new upload system that creates autorag parts

alter table pdf_files add column file_size integer default 0;
alter table pdf_files add column chunk_count integer default null;
