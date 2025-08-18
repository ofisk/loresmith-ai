-- add file_size and chunk_count columns to files table
-- these columns are needed for the new upload system that creates autorag parts

alter table files add column file_size integer default 0;
alter table files add column chunk_count integer default null;
