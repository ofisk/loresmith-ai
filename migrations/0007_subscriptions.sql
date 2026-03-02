-- Subscriptions table for Stripe billing integration
CREATE TABLE IF NOT EXISTS subscriptions (
  id text primary key,
  username text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text not null default 'free' check (tier in ('free', 'basic', 'pro')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired')),
  current_period_end datetime,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp,
  foreign key (username) references users(username) on delete cascade
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_username ON subscriptions(username);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);

-- Monthly usage for free-tier token cap (10k tokens/month)
CREATE TABLE IF NOT EXISTS user_monthly_usage (
  username text not null,
  year_month text not null,
  tokens integer not null default 0,
  updated_at datetime default current_timestamp,
  primary key (username, year_month)
);

CREATE INDEX IF NOT EXISTS idx_user_monthly_usage_username ON user_monthly_usage(username);
