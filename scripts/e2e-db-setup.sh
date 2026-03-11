#!/bin/bash
# E2E database setup: bootstrap + migrations for local wrangler.
# Uses wrangler.local.jsonc and --local.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

DB_NAME="loresmith-db"
CONFIG="wrangler.local.jsonc"

echo "[e2e-db] Running D1 bootstrap (local)..."
wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local \
  --file="$SCRIPT_DIR/d1-bootstrap.sql"

echo "[e2e-db] Running D1 migrations (local)..."
for f in migrations/*.sql; do
  [ -f "$f" ] || continue
  wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local \
    --file="$f" || true
done

if [ "$E2E_SEED_USER" = "1" ]; then
  echo "[e2e-db] Seeding E2E user..."
  E2E_SEED_USER=1 npx tsx scripts/seed-e2e-user.ts

  echo "[e2e-db] Cleaning E2E user data for fresh test state..."
  wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local \
    --file="$SCRIPT_DIR/e2e-cleanup.sql"
fi

echo "[e2e-db] Done."
