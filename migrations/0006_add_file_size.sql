-- add file_size column to pdf_files table
-- this column stores the file size in bytes for statistics calculation

alter table pdf_files add column file_size integer default 0; 