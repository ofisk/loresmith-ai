-- Users table for username/password and Google OAuth accounts.
-- password_hash is null for Google-only users.
-- email_verified_at is set when user clicks the one-time verification link (password accounts) or is set on first Google sign-in.
CREATE TABLE IF NOT EXISTS users (
  id text primary key,
  username text not null unique,
  email text not null unique,
  password_hash text,
  email_verified_at datetime,
  auth_provider text not null default 'password',
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- One-time email verification tokens. Deleted after use or on expiry.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token text primary key,
  username text not null,
  expires_at datetime not null,
  created_at datetime default current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_username ON email_verification_tokens(username);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
