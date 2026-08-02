-- Runtime feature flags and A/B experiments (issue #755).
--
-- Replaces the build-time `VITE_FEATURES` JSON as the source of truth. The old
-- path survives only as an offline fallback in `src/lib/feature-flags.ts`; see
-- docs/FEATURE_FLAGS.md.
--
-- One table, three statuses, because "feature flag" and "A/B test" are the same
-- object at different rollout percentages:
--   off        -> everyone gets variants[0] (control). Kill switch, no redeploy.
--   on         -> everyone gets variants[1] (treatment). Fully rolled out.
--   experiment -> rollout_pct of users get treatment, bucketed deterministically.
--
-- There is deliberately no assignments table. Buckets come from
-- hash(key + ":" + username) % 100, which is sticky for free and — because the
-- hash ignores rollout_pct — monotonic: raising the percentage only ever adds
-- users to treatment, it never yanks someone back to control mid-rollout.
-- See src/lib/experiment-bucketing.ts.
CREATE TABLE IF NOT EXISTS experiments (
  -- camelCase, and the same string passed to isFeatureEnabled("key").
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  -- 'off' | 'on' | 'experiment'
  status TEXT NOT NULL DEFAULT 'off',
  -- 0-100. Only consulted when status = 'experiment'.
  rollout_pct INTEGER NOT NULL DEFAULT 0,
  -- JSON array. Element 0 is control, element 1 is treatment. v1 assumes two
  -- arms because a single rollout_pct cannot describe more; the column is
  -- already an array so widening later is a code change, not a migration.
  variants TEXT NOT NULL DEFAULT '["control","treatment"]',
  created_at DATETIME NOT NULL DEFAULT current_timestamp,
  updated_at DATETIME NOT NULL DEFAULT current_timestamp,
  -- Username of the admin who last toggled, so a surprising flag state in prod
  -- is attributable without digging through logs.
  updated_by TEXT
);

-- The hot path is "read every experiment at once" (the assignments endpoint
-- resolves the whole map for one user), so the admin listing order is the only
-- access pattern worth an index beyond the primary key.
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
