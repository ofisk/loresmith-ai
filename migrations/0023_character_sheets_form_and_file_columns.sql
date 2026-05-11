-- Align character_sheets with CharacterSheetDAO (form + file uploads).
-- Legacy installs only had character_name + character_data; DAO expects structured columns.

ALTER TABLE character_sheets ADD COLUMN character_class TEXT;
ALTER TABLE character_sheets ADD COLUMN character_level INTEGER;
ALTER TABLE character_sheets ADD COLUMN character_race TEXT;
ALTER TABLE character_sheets ADD COLUMN file_name TEXT;
ALTER TABLE character_sheets ADD COLUMN file_content TEXT;
ALTER TABLE character_sheets ADD COLUMN file_size INTEGER;
ALTER TABLE character_sheets ADD COLUMN processed_data TEXT;
ALTER TABLE character_sheets ADD COLUMN processed_at TEXT;
