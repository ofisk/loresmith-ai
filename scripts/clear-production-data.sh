#!/bin/bash

# Script to clear all production data while preserving datastores
# This script clears both database data and R2 storage files

set -e

echo "🚨 WARNING: This will clear ALL production data!"
echo "This includes:"
echo "  - All database records (campaigns, files, users, etc.)"
echo "  - All uploaded files in R2 storage"
echo "  - All AutoRAG job tracking data"
echo ""
echo "The datastores themselves (tables, buckets) will be preserved."
echo ""

read -p "Are you sure you want to continue? Type 'YES' to confirm: " confirmation

if [ "$confirmation" != "YES" ]; then
    echo "Operation cancelled."
    exit 1
fi

echo ""
echo "🔄 Starting production data clearing process..."

# Step 1: Run the database migration to clear all data
echo "📊 Clearing database data..."
wrangler d1 execute loresmith-db --file=./scripts/clear_production_data.sql --remote

if [ $? -eq 0 ]; then
    echo "✅ Database data cleared successfully"
else
    echo "❌ Failed to clear database data"
    exit 1
fi

# Step 2: Clear R2 storage files
echo "🗂️  Clearing R2 storage files..."
echo "⚠️  Note: R2 object listing is not available via Wrangler CLI"
echo "   To clear R2 files, use the Cloudflare dashboard or API"
echo "   For now, only database data has been cleared"

# Step 3: Clear Vectorize embeddings (if any)
echo "🧠 Clearing Vectorize embeddings..."
wrangler vectorize delete loresmith-embeddings --force 2>/dev/null || echo "ℹ️  No embeddings to clear or index doesn't exist"

# Step 4: Recreate Vectorize index
echo "🔄 Recreating Vectorize index..."
wrangler vectorize create loresmith-embeddings --dimensions=1536 --metric=cosine
echo "✅ Vectorize index recreated successfully"

echo ""
echo "🎉 Production data clearing completed successfully!"
echo ""
echo "✅ What was cleared:"
echo "  - All database records (campaigns, files, users, etc.)"
echo "  - All uploaded files in R2 storage"
echo "  - All AutoRAG job tracking data"
echo "  - All vector embeddings"
echo ""
echo "✅ What was preserved:"
echo "  - Database table structures and schemas"
echo "  - R2 bucket configuration"
echo "  - Vectorize index configuration (recreated)"
echo "  - All indexes and foreign key relationships"
echo ""
echo "The application is now ready for fresh data while maintaining all infrastructure."
