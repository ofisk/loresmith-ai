#!/bin/bash

# Script to fully reset database to clean slate and clear all data
# This script works for both local and production environments

set -e

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ENVIRONMENT="${1:-local}"  # 'local' or 'production'

if [ "$ENVIRONMENT" != "local" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "❌ Error: Environment must be 'local' or 'production'"
    echo "Usage: $0 [local|production]"
    exit 1
fi

REMOTE_FLAG=$(get_db_remote_flag "$ENVIRONMENT")
ENV_LABEL=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')

check_wrangler

confirm_action "🚨 WARNING: This will COMPLETELY RESET the $ENV_LABEL database!

This will:
  - DROP ALL existing tables
  - Recreate all tables using clean_slate.sql
  - Clear ALL data (campaigns, files, users, etc.)$([ "$ENVIRONMENT" == "production" ] && echo "
  - Clear all R2 storage files
  - Clear all Vectorize embeddings")"

echo ""
echo "🔄 Starting $ENV_LABEL database reset process..."

# Step 1: Drop all tables
echo "📊 Dropping all existing tables..."
wrangler d1 execute "$DB_NAME" --file=./scripts/reset-to-clean-slate.sql $REMOTE_FLAG || {
    echo "⚠️  Some tables may not have existed (this is OK if database is already empty)"
}

echo "✅ Table drop process completed"

# Step 2: Apply clean slate migration
echo "🔄 Applying clean slate migration..."
if ! wrangler d1 execute "$DB_NAME" --file=./migrations/0000_clean_slate.sql $REMOTE_FLAG; then
    echo "❌ Failed to apply clean slate migration"
    exit 1
fi
echo "✅ Clean slate migration applied successfully"

# Step 3: For production, clear R2 and Vectorize
if [ "$ENVIRONMENT" == "production" ]; then
    echo ""
    echo "🗂️  Clearing R2 storage files..."
    if [ -f "./scripts/clear-r2.js" ]; then
        node ./scripts/clear-r2.js || echo "⚠️  R2 cleanup script failed or requires credentials"
    elif [ -f "./scripts/clear-r2-simple.sh" ]; then
        ./scripts/clear-r2-simple.sh || echo "⚠️  R2 cleanup script failed or requires credentials"
    else
        echo "⚠️  R2 cleanup script not found, skipping R2 cleanup"
    fi
    
    echo ""
    reset_vectorize_index 768 cosine
fi

# Step 4: Verify tables were created
echo ""
echo "📋 Verifying database tables..."
list_db_tables "$DB_NAME" "$REMOTE_FLAG"

echo ""
echo "🎉 $ENV_LABEL database reset completed successfully!"
echo ""
echo "✅ What was done:"
echo "  - All tables dropped and recreated"
echo "  - Clean slate schema applied"
if [ "$ENVIRONMENT" == "production" ]; then
    echo "  - R2 storage cleared"
    echo "  - Vectorize index recreated"
fi
echo ""
echo "The database is now in a clean state and ready for fresh data."

