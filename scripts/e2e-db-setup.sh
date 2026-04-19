#!/bin/bash
# E2E database setup: bootstrap + migrations for local wrangler.
# Default wrangler.e2e.jsonc (no remote bindings — CI has no Cloudflare API token).
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

export E2E_WRANGLER_CONFIG="${E2E_WRANGLER_CONFIG:-wrangler.e2e.jsonc}"
DB_NAME="loresmith-db-dev"
CONFIG="$E2E_WRANGLER_CONFIG"

echo "[e2e-db] Clearing Miniflare persistence for a clean local D1 (avoids duplicate migration state)..."
rm -rf "$ROOT_DIR/.wrangler/state"

echo "[e2e-db] Running D1 bootstrap (local)..."
npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local \
  --file="$SCRIPT_DIR/d1-bootstrap.sql"

echo "[e2e-db] Running D1 migrations (local)..."
for f in migrations/*.sql; do
  [ -f "$f" ] || continue
  npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local \
    --file="$f"
done

if [ "$E2E_SEED_USER" = "1" ]; then
  echo "[e2e-db] Seeding E2E user..."
  E2E_SEED_USER=1 npx tsx scripts/seed-e2e-user.ts

  echo "[e2e-db] Cleaning E2E user data for fresh test state..."
  npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local \
    --file="$SCRIPT_DIR/e2e-cleanup.sql"
fi

echo "[e2e-db] Done."
