-- Campaign members: shared access with roles (owner remains campaigns.username)
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id text not null,
  username text not null,
  role text not null check (role in ('editor_gm', 'readonly_gm', 'editor_player', 'readonly_player')),
  invited_by text not null,
  created_at datetime default current_timestamp,
  primary key (campaign_id, username),
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_campaign_members_username ON campaign_members(username);

-- Share links for inviting users to campaigns
CREATE TABLE IF NOT EXISTS campaign_share_links (
  token text primary key,
  campaign_id text not null,
  role text not null check (role in ('editor_gm', 'readonly_gm', 'editor_player', 'readonly_player')),
  created_by text not null,
  expires_at datetime,
  max_uses integer,
  use_count integer not null default 0,
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_campaign_share_links_campaign_id ON campaign_share_links(campaign_id);

-- Resource proposals from editor players (pending GM/owner review)
CREATE TABLE IF NOT EXISTS campaign_resource_proposals (
  id text primary key,
  campaign_id text not null,
  file_key text not null,
  file_name text not null,
  proposed_by text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at datetime,
  created_at datetime default current_timestamp,
  foreign key (campaign_id) references campaigns(id) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_campaign_resource_proposals_campaign_id ON campaign_resource_proposals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_resource_proposals_proposed_by ON campaign_resource_proposals(proposed_by);
