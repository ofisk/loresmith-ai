# Clear Production Data

This document explains how to clear all production data while preserving the datastores themselves.

## Overview

The LoreSmith AI application stores data in multiple places:

- **D1 Database**: Structured data (campaigns, files, users, etc.)
- **R2 Storage**: File uploads and binary data
- **Vectorize**: AI embeddings for search functionality

## Available Scripts

### 1. Clear All Data (Database + R2 + Vectorize)

**Script**: `scripts/clear-production-data.sh`

This script clears everything:

- All database records
- All uploaded files in R2 storage
- All vector embeddings

**Usage**:

```bash
./scripts/clear-production-data.sh
```

### 2. Clear R2 Storage Only (Preserve Database)

**Script**: `scripts/clear-r2-simple.sh`

This script clears only R2 storage files:

- All uploaded files in R2 storage
- **Preserves** database data and vector embeddings

**Usage**:

```bash
./scripts/clear-r2-simple.sh
```

## Manual Database Clearing

If you prefer to run the database clearing manually:

```bash
wrangler d1 execute loresmith-db --file=./scripts/clear_production_data.sql --remote
```

## What Gets Cleared

### Database Tables

- `campaigns` - All user campaigns
- `campaign_resources` - Campaign file associations
- `campaign_context` - Campaign context data
- `campaign_characters` - Character information
- `campaign_planning_sessions` - Session planning data
- `campaign_context_chunks` - Context chunks for RAG
- `character_sheets` - Character sheet data
- `file_metadata` - File metadata and search data
- `file_chunks` - File content chunks for RAG
- `user_notifications` - User notification data
- `user_openai_keys` - User API keys

### R2 Storage (if using full clear script)

- All uploaded files
- File metadata objects
- Staging files

**Note**: R2 object listing and deletion via Wrangler CLI is limited. For complete R2 clearing, use the Cloudflare dashboard or API.

### Vectorize

- All AI embeddings for search functionality

## What Gets Preserved

- **Database Structure**: All tables, indexes, and foreign key relationships
- **R2 Bucket Configuration**: Bucket settings and permissions
- **Vectorize Index Configuration**: Index settings and schema
- **Application Configuration**: All environment variables and settings

## Safety Features

Both scripts include:

- **Confirmation prompt**: Requires typing 'YES' to proceed
- **Error handling**: Stops execution if any step fails
- **Clear feedback**: Shows what's being cleared and what's preserved
- **Non-destructive**: Only deletes data, never drops tables or buckets

## Recovery

After clearing data:

1. The application will be in a clean state
2. All tables exist but are empty
3. Users can start fresh with new campaigns and files
4. No data recovery is possible - this is a permanent operation

## When to Use

- **Development/Testing**: Reset to clean state
- **Production Issues**: Clear corrupted data
- **Privacy Compliance**: Remove all user data
- **Fresh Start**: Begin with empty system

## Important Notes

⚠️ **This is a destructive operation** - all data will be permanently deleted.

⚠️ **No backup is created** - ensure you have backups if needed.

⚠️ **Production impact** - this will affect all users and data.

## Troubleshooting

### Permission Denied

```bash
chmod +x scripts/clear-production-data.sh
chmod +x scripts/clear-database-only.sh
```

### Wrangler Not Found

Ensure Wrangler CLI is installed and configured:

```bash
npm install -g wrangler
wrangler login
```

### Database Connection Issues

Verify your D1 database is properly configured in `wrangler.toml` or `wrangler.local.jsonc`.
