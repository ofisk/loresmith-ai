-- Admin flag on users. When set, the user receives isAdmin in the JWT and has admin access.
-- Set via manual UPDATE for now, e.g. UPDATE users SET is_admin = 1 WHERE username = 'ofisk';
ALTER TABLE users ADD COLUMN is_admin integer not null default 0;
