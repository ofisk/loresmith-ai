#!/bin/bash

# Database migration script for LoreSmith AI (LOCAL DEVELOPMENT)
# This script automatically runs all SQL migration files in the migrations directory
# Continues execution even if individual migrations fail

set -e  # Exit on any error

echo "🚀 Running LoreSmith AI LOCAL database migrations..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler is not installed. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if migrations directory exists
if [ ! -d "migrations" ]; then
    echo "❌ Error: migrations directory not found"
    exit 1
fi

# Get database name from wrangler config
DB_NAME="loresmith-db"

# Find all SQL files in migrations directory and sort them
MIGRATION_FILES=$(find migrations -name "*.sql" | sort)

if [ -z "$MIGRATION_FILES" ]; then
    echo "⚠️  No SQL migration files found in migrations directory"
    exit 0
fi

echo "📋 Found $(echo "$MIGRATION_FILES" | wc -l) migration files to execute"
echo ""

# Track success and failure counts
SUCCESS_COUNT=0
FAILURE_COUNT=0
FAILED_MIGRATIONS=""

# Execute each migration file
for migration_file in $MIGRATION_FILES; do
    migration_name=$(basename "$migration_file")
    echo "🔄 Running migration: $migration_name"
    
    # Special handling for clean slate migration
    if [[ "$migration_name" == "0000_clean_slate.sql" ]]; then
        # Check if campaigns table exists (indicates database has data)
        HAS_DATA=$(wrangler d1 execute "$DB_NAME" --command="SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='campaigns';" --local 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")
        
        if [ "$HAS_DATA" != "0" ]; then
            echo "⚠️  Skipping clean slate migration - database already has tables (safe to skip)"
            echo "✅ Success: $migration_name (skipped - tables already exist)"
            ((SUCCESS_COUNT++))
            echo ""
            continue
        else
            echo "ℹ️  Running clean slate migration on fresh database"
        fi
    fi
    
    if wrangler d1 execute "$DB_NAME" --file="$migration_file" --local; then
        echo "✅ Success: $migration_name"
        ((SUCCESS_COUNT++))
    else
        echo "❌ Failed: $migration_name"
        ((FAILURE_COUNT++))
        FAILED_MIGRATIONS="$FAILED_MIGRATIONS\n  - $migration_name"
    fi
    
    echo ""
done

# Summary
echo "📊 Migration Summary:"
echo "  ✅ Successful: $SUCCESS_COUNT"
echo "  ❌ Failed: $FAILURE_COUNT"

if [ $FAILURE_COUNT -gt 0 ]; then
    echo "  📝 Failed migrations:$FAILED_MIGRATIONS"
    echo ""
    echo "⚠️  Some migrations failed, but execution continued."
    echo "   You may want to check the failed migrations and run them manually."
fi

echo ""
echo "📋 Current database tables:"
wrangler d1 execute "$DB_NAME" --command="SELECT name FROM sqlite_master WHERE type='table';" --local

echo ""
echo "🎉 Local migration process completed!" 