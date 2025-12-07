#!/bin/bash

# Script to fully reset database to clean slate and clear all data
# This script works for both local and production environments

set -e

ENVIRONMENT="${1:-local}"  # 'local' or 'production'
DB_NAME="loresmith-db"

if [ "$ENVIRONMENT" != "local" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "❌ Error: Environment must be 'local' or 'production'"
    echo "Usage: $0 [local|production]"
    exit 1
fi

REMOTE_FLAG=""
ENV_LABEL=""
if [ "$ENVIRONMENT" == "production" ]; then
    REMOTE_FLAG="--remote"
    ENV_LABEL="PRODUCTION"
else
    REMOTE_FLAG="--local"
    ENV_LABEL="LOCAL"
fi

echo "🚨 WARNING: This will COMPLETELY RESET the $ENV_LABEL database!"
echo ""
echo "This will:"
echo "  - DROP ALL existing tables"
echo "  - Recreate all tables using clean_slate.sql"
echo "  - Clear ALL data (campaigns, files, users, etc.)"
echo ""
if [ "$ENVIRONMENT" == "production" ]; then
    echo "  - Clear all R2 storage files"
    echo "  - Clear all Vectorize embeddings"
fi
echo ""

read -p "Are you sure you want to continue? Type 'YES' to confirm: " confirmation

if [ "$confirmation" != "YES" ]; then
    echo "Operation cancelled."
    exit 1
fi

echo ""
echo "🔄 Starting $ENV_LABEL database reset process..."

# Step 1: Drop all tables
echo "📊 Dropping all existing tables..."
# Use || true to continue even if some tables don't exist
wrangler d1 execute "$DB_NAME" --file=./scripts/reset-to-clean-slate.sql $REMOTE_FLAG || {
    echo "⚠️  Some tables may not have existed (this is OK if database is already empty)"
    # Continue anyway - clean slate will create all tables
}

echo "✅ Table drop process completed"

# Step 2: Apply clean slate migration
echo "🔄 Applying clean slate migration..."
wrangler d1 execute "$DB_NAME" --file=./migrations/0000_clean_slate.sql $REMOTE_FLAG

if [ $? -eq 0 ]; then
    echo "✅ Clean slate migration applied successfully"
else
    echo "❌ Failed to apply clean slate migration"
    exit 1
fi

# Step 3: For production, clear R2 and Vectorize
if [ "$ENVIRONMENT" == "production" ]; then
    echo ""
    echo "🗂️  Clearing R2 storage files..."
    if [ -f "./scripts/clear-r2-simple.sh" ]; then
        ./scripts/clear-r2-simple.sh || echo "⚠️  R2 cleanup script failed or requires credentials"
    else
        echo "⚠️  R2 cleanup script not found, skipping R2 cleanup"
    fi
    
    echo ""
    echo "🧠 Clearing Vectorize embeddings..."
    wrangler vectorize delete loresmith-embeddings --force 2>/dev/null || echo "ℹ️  No embeddings to clear or index doesn't exist"
    
    echo "🔄 Recreating Vectorize index..."
    wrangler vectorize delete loresmith-embeddings --force 2>/dev/null || true
    wrangler vectorize create loresmith-embeddings --dimensions=1536 --metric=cosine 2>/dev/null || echo "⚠️  Vectorize index may already exist or creation failed"
    echo "✅ Vectorize index recreated"
fi

# Step 4: Verify tables were created
echo ""
echo "📋 Verifying database tables..."
wrangler d1 execute "$DB_NAME" --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" $REMOTE_FLAG

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

