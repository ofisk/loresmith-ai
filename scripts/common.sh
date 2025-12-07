#!/bin/bash

# Common utilities and constants for LoreSmith AI scripts
# Source this file in other scripts: source ./scripts/common.sh

# =============================================================================
# Constants
# =============================================================================

export DB_NAME="${DB_NAME:-loresmith-db}"
export R2_BUCKET="${R2_BUCKET:-loresmith-files}"
export VECTORIZE_INDEX="${VECTORIZE_INDEX:-loresmith-embeddings}"
export ACCOUNT_ID="${ACCOUNT_ID:-f67932e71175b3ee7c945c6bb84c5259}"

# =============================================================================
# Utility Functions
# =============================================================================

# Check if wrangler is installed
check_wrangler() {
    if ! command -v wrangler &> /dev/null; then
        echo "❌ Error: wrangler is not installed. Please install it first:"
        echo "npm install -g wrangler"
        exit 1
    fi
}

# Check if migrations directory exists
check_migrations_dir() {
    if [ ! -d "migrations" ]; then
        echo "❌ Error: migrations directory not found"
        exit 1
    fi
}

# Prompt for confirmation
confirm_action() {
    local message="$1"
    echo "$message"
    echo ""
    read -p "Are you sure you want to continue? Type 'YES' to confirm: " confirmation
    if [ "$confirmation" != "YES" ]; then
        echo "Operation cancelled."
        exit 1
    fi
}

# Clear Vectorize index and recreate
reset_vectorize_index() {
    local dimensions="${1:-1536}"
    local metric="${2:-cosine}"
    
    echo "🧠 Clearing Vectorize embeddings..."
    wrangler vectorize delete "$VECTORIZE_INDEX" --force 2>/dev/null || echo "ℹ️  No embeddings to clear or index doesn't exist"
    
    echo "🔄 Recreating Vectorize index..."
    wrangler vectorize delete "$VECTORIZE_INDEX" --force 2>/dev/null || true
    wrangler vectorize create "$VECTORIZE_INDEX" --dimensions="$dimensions" --metric="$metric" 2>/dev/null || echo "⚠️  Vectorize index may already exist or creation failed"
    echo "✅ Vectorize index recreated"
}

# Get database remote flag based on environment
get_db_remote_flag() {
    local environment="${1:-local}"
    if [ "$environment" == "production" ]; then
        echo "--remote"
    else
        echo "--local"
    fi
}

# Check if database has tables
db_has_tables() {
    local db_name="$1"
    local remote_flag="$2"
    local table_name="${3:-campaigns}"
    
    local count=$(wrangler d1 execute "$db_name" --command="SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='$table_name';" $remote_flag 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")
    [ "$count" != "0" ]
}

# List database tables
list_db_tables() {
    local db_name="$1"
    local remote_flag="$2"
    
    wrangler d1 execute "$db_name" --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" $remote_flag
}

# Execute migration file with error handling
execute_migration() {
    local db_name="$1"
    local migration_file="$2"
    local remote_flag="$3"
    local migration_name=$(basename "$migration_file")
    
    echo "🔄 Running migration: $migration_name"
    
    # Special handling for clean slate migration
    if [[ "$migration_name" == "0000_clean_slate.sql" ]]; then
        if db_has_tables "$db_name" "$remote_flag"; then
            echo "⚠️  Skipping clean slate migration - database already has tables (safe to skip)"
            echo "✅ Success: $migration_name (skipped - tables already exist)"
            return 0
        else
            echo "ℹ️  Running clean slate migration on fresh database"
        fi
    fi
    
    if wrangler d1 execute "$db_name" --file="$migration_file" $remote_flag; then
        echo "✅ Success: $migration_name"
        return 0
    else
        echo "❌ Failed: $migration_name"
        return 1
    fi
}

# Run all migrations
run_migrations() {
    local db_name="$1"
    local remote_flag="$2"
    
    check_migrations_dir
    
    local migration_files=$(find migrations -name "*.sql" | sort)
    
    if [ -z "$migration_files" ]; then
        echo "⚠️  No SQL migration files found in migrations directory"
        return 0
    fi
    
    echo "📋 Found $(echo "$migration_files" | wc -l) migration files to execute"
    echo ""
    
    local success_count=0
    local failure_count=0
    local failed_migrations=""
    
    for migration_file in $migration_files; do
        if execute_migration "$db_name" "$migration_file" "$remote_flag"; then
            ((success_count++))
        else
            ((failure_count++))
            failed_migrations="$failed_migrations\n  - $(basename "$migration_file")"
        fi
        echo ""
    done
    
    echo "📊 Migration Summary:"
    echo "  ✅ Successful: $success_count"
    echo "  ❌ Failed: $failure_count"
    
    if [ $failure_count -gt 0 ]; then
        echo "  📝 Failed migrations:$failed_migrations"
        echo ""
        echo "⚠️  Some migrations failed, but execution continued."
        echo "   You may want to check the failed migrations and run them manually."
        return 1
    fi
    
    return 0
}

