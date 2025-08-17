-- add file_size column to files table
-- this column stores the file size in bytes for statistics calculation

alter table files add column file_size integer default 0; 