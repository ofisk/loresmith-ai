-- migration to add character sheets support
-- this enables players to upload and manage character sheets in various formats

-- character sheets table for storing uploaded character sheet files
create table if not exists character_sheets (
  id text primary key,
  campaign_id text not null,
  file_key text not null,
  file_name text not null,
  file_type text not null, -- 'pdf', 'docx', 'doc', 'txt', 'json'
  character_name text,
  description text,
  status text default 'uploaded', -- 'uploaded', 'processing', 'completed', 'error'
  extracted_data text, -- json data extracted from the character sheet
  metadata text, -- json metadata for additional information
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

-- indexes for character sheets
create index if not exists idx_character_sheets_campaign_id 
  on character_sheets(campaign_id);
create index if not exists idx_character_sheets_file_key 
  on character_sheets(file_key);
create index if not exists idx_character_sheets_status 
  on character_sheets(status);
create index if not exists idx_character_sheets_character_name 
  on character_sheets(character_name); 