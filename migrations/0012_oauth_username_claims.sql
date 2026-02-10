-- Maps a Google account email to a pre-claimed username. When a user signs in with
-- Google and their email is in this table, they are logged in as that username
-- (e.g. existing dev users ofisk / aniham). Update the emails to the real Google addresses.
CREATE TABLE IF NOT EXISTS oauth_username_claims (
  google_email text primary key,
  username text not null unique,
  created_at datetime default current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_oauth_username_claims_username ON oauth_username_claims(username);

-- Pre-claim usernames for two dev users. Replace with actual Google account emails.
INSERT INTO oauth_username_claims (google_email, username) VALUES
  ('ofisk@example.com', 'ofisk'),
  ('aniham@example.com', 'aniham');
