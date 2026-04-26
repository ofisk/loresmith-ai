#!/bin/bash

# Unified database migration script for LoreSmith AI.
# Uses Wrangler's tracked migrations (`d1_migrations`) so each file runs once.
# For production recovery when a migration must be skipped, use:
#   npm run migrate:prod:apply:resilient
#
# Usage: ./scripts/migrate.sh [local|production]

set -e

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/common.sh"

ENVIRONMENT="${1:-local}"

if [ "$ENVIRONMENT" != "local" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "❌ Error: Environment must be 'local' or 'production'"
    echo "Usage: $0 [local|production]"
    exit 1
fi

ENV_LABEL=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')

if [ "$ENVIRONMENT" = "production" ]; then
    CONFIG="$ROOT_DIR/wrangler.jsonc"
    DB_NAME="loresmith-db"
    REMOTE_FLAG="--remote"
else
    CONFIG="$ROOT_DIR/wrangler.local.jsonc"
    DB_NAME="loresmith-db-dev"
    REMOTE_FLAG="--local"
fi

echo "🚀 Running LoreSmith AI $ENV_LABEL database migrations..."
echo "   Database: $DB_NAME  Config: $CONFIG  $REMOTE_FLAG"

check_wrangler

cd "$ROOT_DIR"
# -y: non-interactive (CI); Cloudflare records applied migrations and rolls back a failed migration batch.
npx wrangler d1 migrations apply "$DB_NAME" --config "$CONFIG" $REMOTE_FLAG

echo ""
echo "📋 Current database tables:"
list_db_tables "$DB_NAME" "$REMOTE_FLAG" "$CONFIG"

echo ""
echo "🎉 $ENV_LABEL migration process completed!"
