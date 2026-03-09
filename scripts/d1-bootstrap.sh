#!/bin/bash
# One-time D1 bootstrap: creates base schema (tables, indexes, view, triggers).
# Run before wrangler d1 migrations apply on a fresh database.
# Usage: ./scripts/d1-bootstrap.sh [dev|prod]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

ENV="${1:-dev}"
if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
	echo "Usage: $0 [dev|prod]"
	exit 1
fi

if [ "$ENV" = "dev" ]; then
	DB_NAME="loresmith-db-dev"
	CONFIG="wrangler.dev.jsonc"
else
	DB_NAME="loresmith-db"
	CONFIG="wrangler.jsonc"
fi

echo "Running D1 bootstrap for $ENV ($DB_NAME)..."

# Main schema (tables, indexes, view)
wrangler d1 execute "$DB_NAME" --config "$CONFIG" --remote --file="$SCRIPT_DIR/d1-bootstrap.sql"

# Triggers (run via --command to avoid D1 semicolon-splitting issues)
wrangler d1 execute "$DB_NAME" --config "$CONFIG" --remote --command="CREATE TRIGGER IF NOT EXISTS update_shard_registry_timestamp AFTER UPDATE ON shard_registry FOR EACH ROW BEGIN UPDATE shard_registry SET updated_at = datetime('now') WHERE shard_id = new.shard_id; END"
wrangler d1 execute "$DB_NAME" --config "$CONFIG" --remote --command="CREATE TRIGGER IF NOT EXISTS trigger_entity_relationships_updated_at AFTER UPDATE ON entity_relationships FOR EACH ROW BEGIN UPDATE entity_relationships SET updated_at = current_timestamp WHERE id = new.id; END"

echo "Bootstrap complete. Run 'npm run migrate:dev' (or migrate:prod) to apply incremental migrations."
