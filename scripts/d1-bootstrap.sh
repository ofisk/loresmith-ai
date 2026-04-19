#!/bin/bash
# One-time D1 bootstrap: creates base schema (tables, indexes, view, triggers).
# Run before wrangler d1 migrations apply on a fresh database.
# Usage: ./scripts/d1-bootstrap.sh [local|dev|prod]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

ENV="${1:-dev}"
if [ "$ENV" != "local" ] && [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
	echo "Usage: $0 [local|dev|prod]"
	exit 1
fi

if [ "$ENV" = "local" ]; then
	DB_NAME="loresmith-db-dev"
	CONFIG="wrangler.local.jsonc"
	REMOTE_FLAG="--local"
elif [ "$ENV" = "dev" ]; then
	DB_NAME="loresmith-db-dev"
	CONFIG="wrangler.dev.jsonc"
	REMOTE_FLAG="--remote"
else
	DB_NAME="loresmith-db"
	CONFIG="wrangler.jsonc"
	REMOTE_FLAG="--remote"
fi

echo "Running D1 bootstrap for $ENV ($DB_NAME)..."

# npx: CI runs this script directly; node_modules/.bin is not on PATH unless via npm.
# Main schema (tables, indexes, view)
npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" $REMOTE_FLAG --file="$SCRIPT_DIR/d1-bootstrap.sql"

# Triggers (run via --command to avoid D1 semicolon-splitting issues)
npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" $REMOTE_FLAG --command="CREATE TRIGGER IF NOT EXISTS update_shard_registry_timestamp AFTER UPDATE ON shard_registry FOR EACH ROW BEGIN UPDATE shard_registry SET updated_at = datetime('now') WHERE shard_id = new.shard_id; END"
npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" $REMOTE_FLAG --command="CREATE TRIGGER IF NOT EXISTS trigger_entity_relationships_updated_at AFTER UPDATE ON entity_relationships FOR EACH ROW BEGIN UPDATE entity_relationships SET updated_at = current_timestamp WHERE id = new.id; END"

echo "Bootstrap complete. Run 'wrangler d1 migrations apply ...' (e.g. npm run migrate:dev / migrate:local:apply) to apply incremental migrations."
