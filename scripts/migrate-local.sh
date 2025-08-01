#!/bin/bash

# Database migration script for LoreSmith AI (LOCAL DEVELOPMENT)
# This script runs all database migrations against the local D1 database

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

# Run migrations in order (LOCAL)
# echo "📋 Running migration: 0000_loresmith_db_schema.sql"
# wrangler d1 execute loresmith-db --file=migrations/0000_loresmith_db_schema.sql --local

# echo "📋 Running migration: 0001_campaign_context.sql"
# wrangler d1 execute loresmith-db --file=migrations/0001_campaign_context.sql --local

# echo "📋 Running migration: 0002_character_sheets.sql"
# wrangler d1 execute loresmith-db --file=migrations/0002_character_sheets.sql --local

echo "📋 Running migration: 0004_user_openai_keys.sql"
wrangler d1 execute loresmith-db --file=migrations/0004_user_openai_keys.sql --local

echo "✅ All LOCAL migrations completed successfully!"
echo "📊 Database tables created:"
wrangler d1 execute loresmith-db --command="SELECT name FROM sqlite_master WHERE type='table';" --local 