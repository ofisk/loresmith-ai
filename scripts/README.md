# Cloudflare Infrastructure Recreation Scripts

This directory contains scripts for managing Cloudflare infrastructure for the LoreSmith AI project.

## recreate-infrastructure.sh

A comprehensive script that tears down and recreates all Cloudflare infrastructure including:

- Cloudflare Worker
- Durable Objects (Chat, UserFileTracker, UploadSession, NotificationHub)
- Queues (upload-events, file-processing-dlq)
- D1 Database (loresmith-db)
- R2 Bucket (loresmith-files)
- Vectorize Index (loresmith-embeddings)

### Usage

```bash
# Interactive mode (will prompt for confirmation)
./scripts/recreate-infrastructure.sh

# Non-interactive mode (auto-confirms)
yes | ./scripts/recreate-infrastructure.sh
```

### Prerequisites

1. **Authentication**: Must be logged in to Cloudflare

   ```bash
   wrangler login
   wrangler whoami  # Verify login
   ```

2. **Dependencies**:
   - `wrangler` CLI (latest version recommended)
   - `npm` for building the project

3. **Project Structure**:
   - Must be run from project root
   - Requires `wrangler.jsonc` configuration file
   - Requires `migrations/` directory with SQL files (optional)

### Extra Steps Required

The script includes several workarounds for Cloudflare API limitations:

#### 1. Queue Binding Issues

**Problem**: Cannot delete a Worker that has queue bindings, even after removing consumers.

**Solution**:

- Create temporary config without `queues` section
- Deploy temporary Worker to unbind queues
- Delete queues
- Delete Worker
- Recreate queues
- Deploy with full configuration

#### 2. Queue Consumer Management

**Problem**: `wrangler queues delete` with `--force` flag doesn't exist.

**Solution**:

- Use `wrangler queues consumer remove` to detach consumers first
- Use `yes | wrangler queues delete` for non-interactive deletion

#### 3. Error Handling

**Problem**: Various API errors can occur during deletion/recreation.

**Solution**:

- All destructive operations use `|| true` to continue on failure
- Temporary config cleanup on script exit
- Verification step at the end to confirm all resources are active

### Configuration

The scripts will prompt for your Cloudflare Account ID at runtime. Update these variables in the script if your resource names differ:

```bash
WORKER_NAME="loresmith-ai"
D1_NAME="loresmith-db"
R2_BUCKET="loresmith-files"
VECTORIZE_INDEX="loresmith-embeddings"
QUEUE_MAIN="upload-events"
QUEUE_DLQ="file-processing-dlq"
```

**Note**: The Account ID is now prompted interactively to avoid hardcoding sensitive information.

### Troubleshooting

#### Common Issues

1. **Authentication Error (10001)**

   ```bash
   wrangler login
   wrangler whoami
   ```

2. **Worker Still in Use as Queue Consumer (10064)**
   - The script handles this automatically by creating a temporary config
   - If it still fails, manually remove queue consumers first

3. **Queue Still Referenced by Worker Binding (11005)**
   - The script handles this by deploying without queue bindings first
   - If it still fails, check your `wrangler.jsonc` for queue bindings

4. **Unknown Error (10013)**
   - Usually indicates API rate limiting or temporary issues
   - Wait a few minutes and retry
   - Update Wrangler to latest version

#### Manual Recovery Steps

If the script fails partway through:

1. **Check current state**:

   ```bash
   wrangler whoami
   wrangler queues list
   wrangler d1 list
   wrangler r2 bucket list
   wrangler vectorize list
   ```

2. **Clean up manually**:

   ```bash
   # Remove queue consumers
   wrangler queues consumer remove upload-events loresmith-ai
   wrangler queues consumer remove file-processing-dlq loresmith-ai

   # Delete resources
   wrangler queues delete upload-events
   wrangler queues delete file-processing-dlq
   wrangler delete loresmith-ai
   wrangler d1 delete loresmith-db --yes
   wrangler r2 bucket delete loresmith-files --force
   wrangler vectorize delete loresmith-embeddings --yes
   ```

3. **Recreate manually**:
   ```bash
   wrangler queues create upload-events
   wrangler queues create file-processing-dlq
   wrangler d1 create loresmith-db
   wrangler r2 bucket create loresmith-files
   wrangler vectorize create loresmith-embeddings
   npm run build
   wrangler deploy
   ```

### Safety Notes

⚠️ **WARNING**: This script will delete ALL data in:

- R2 bucket (all uploaded files)
- D1 database (all campaigns, users, etc.)
- Vectorize index (all embeddings)
- Durable Object storage (all chat sessions, file tracking, etc.)

Make sure to backup any important data before running this script.

### Development vs Production

- **Development**: Safe to run anytime
- **Production**: Only run during maintenance windows
- **Staging**: Consider running on staging environment first

### Database Migrations

The project uses a migration system for database schema changes:

#### Running Migrations

```bash
# Run all migrations (production)
./scripts/migrate.sh

# Run all migrations (local development)
./scripts/migrate-local.sh
```

#### Migration Files

- `migrations/0000_clean_slate.sql` - Complete database schema (includes `updated_at` column)
- `migrations/0001_add_autorag_jobs_table.sql` - AutoRAG job tracking
- `migrations/0002_add_sync_queue_table.sql` - Sync queue management
- `migrations/0003_add_updated_at_to_file_metadata.sql` - Adds `updated_at` column for stuck file detection

#### Important Notes

- **Clean Slate Migration**: `0000_clean_slate.sql` drops and recreates all tables
- **Schema Updates**: Always update the clean slate migration when adding new columns
- **Stuck File Detection**: Requires `updated_at` column in `file_metadata` table for proper timeout handling

### Related Files

- `wrangler.jsonc` - Main Wrangler configuration
- `migrations/` - Database migration files
- `dist/` - Built application files (created during build)
