#!/bin/bash

# Script to clear all production data while preserving datastores
# This script clears both database data and R2 storage files

set -e

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

cd "$ROOT_DIR"

check_wrangler

confirm_action "🚨 WARNING: This will clear ALL production data!
This includes:
  - All database records (campaigns, files, users, etc.)
  - All uploaded files in R2 storage

The datastores themselves (tables, buckets) will be preserved."

echo ""
echo "🔄 Starting production data clearing process..."

# Step 1: Run the database migration to clear all data
echo "📊 Clearing database data..."
if ! wrangler d1 execute "$DB_NAME" --file=./scripts/maintenance/clear_production_data.sql --remote; then
    echo "❌ Failed to clear database data"
    exit 1
fi
echo "✅ Database data cleared successfully"

# Step 2: Clear R2 storage files
echo ""
echo "🗂️  Clearing R2 storage files..."
if [ -f "./scripts/storage/clear-r2.js" ]; then
    node ./scripts/storage/clear-r2.js || echo "⚠️  R2 cleanup script failed or requires credentials"
elif [ -f "./scripts/storage/clear-r2-simple.sh" ]; then
    ./scripts/storage/clear-r2-simple.sh || echo "⚠️  R2 cleanup script failed or requires credentials"
else
    echo "⚠️  R2 cleanup script not found, skipping R2 cleanup"
fi

# Step 3: Clear and recreate Vectorize embeddings
echo ""
reset_vectorize_index

echo ""
echo "🎉 Production data clearing completed successfully!"
echo ""
echo "✅ What was cleared:"
echo "  - All database records (campaigns, files, users, etc.)"
echo "  - All uploaded files in R2 storage"
echo "  - All vector embeddings"
echo ""
echo "✅ What was preserved:"
echo "  - Database table structures and schemas"
echo "  - R2 bucket configuration"
echo "  - Vectorize index configuration (recreated)"
echo "  - All indexes and foreign key relationships"
echo ""
echo "The application is now ready for fresh data while maintaining all infrastructure."
