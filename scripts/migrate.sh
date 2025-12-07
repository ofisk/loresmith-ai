#!/bin/bash

# Unified database migration script for LoreSmith AI
# Works for both local and production environments
# Usage: ./scripts/migrate.sh [local|production]

set -e

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ENVIRONMENT="${1:-local}"

if [ "$ENVIRONMENT" != "local" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "❌ Error: Environment must be 'local' or 'production'"
    echo "Usage: $0 [local|production]"
    exit 1
fi

REMOTE_FLAG=$(get_db_remote_flag "$ENVIRONMENT")
ENV_LABEL=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')

echo "🚀 Running LoreSmith AI $ENV_LABEL database migrations..."

check_wrangler

run_migrations "$DB_NAME" "$REMOTE_FLAG"

echo ""
echo "📋 Current database tables:"
list_db_tables "$DB_NAME" "$REMOTE_FLAG"

echo ""
echo "🎉 $ENV_LABEL migration process completed!"
