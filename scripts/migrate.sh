#!/bin/bash

# Database migration script for LoreSmith AI (PRODUCTION)
# This script automatically runs all SQL migration files in the migrations directory
# Continues execution even if individual migrations fail

set -e  # Exit on any error

echo "🚀 Running LoreSmith AI PRODUCTION database migrations..."

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
    echo "🔄 Running migration: $(basename "$migration_file")"
    
    if wrangler d1 execute "$DB_NAME" --file="$migration_file" --remote; then
        echo "✅ Success: $(basename "$migration_file")"
        ((SUCCESS_COUNT++))
    else
        echo "❌ Failed: $(basename "$migration_file")"
        ((FAILURE_COUNT++))
        FAILED_MIGRATIONS="$FAILED_MIGRATIONS\n  - $(basename "$migration_file")"
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
wrangler d1 execute "$DB_NAME" --command="SELECT name FROM sqlite_master WHERE type='table';" --remote

echo ""
echo "🎉 Production migration process completed!" 