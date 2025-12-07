# Clearing R2 Storage Files

This guide explains how to programmatically clear all files from your R2 bucket.

## Quick Start

```bash
# Dry run to see what would be deleted
npm run r2:clear:dry-run

# Actually delete all files
npm run r2:clear
```

## Prerequisites

You need authentication credentials to delete R2 objects. Choose one method:

### Option 1: Cloudflare API Token (Recommended)

1. **Create API Token**:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template or create custom token with:
     - **Permissions**: Account → Cloudflare R2 → Edit
   - Copy the token

2. **Set Environment Variable**:

   ```bash
   export CLOUDFLARE_API_TOKEN='your-token-here'
   ```

   Or add to `.dev.vars` or `.vars`:

   ```env
   CLOUDFLARE_API_TOKEN=your-token-here
   ```

### Option 2: R2 API Credentials

1. **Get R2 API Credentials**:
   - Go to https://dash.cloudflare.com → R2 → Manage R2 API Tokens
   - Create a new API token with read/write permissions
   - Copy the Access Key ID and Secret Access Key

2. **Set Environment Variables**:

   ```bash
   export R2_ACCESS_KEY_ID='your-access-key'
   export R2_SECRET_ACCESS_KEY='your-secret-key'
   ```

3. **Install AWS CLI** (required for this method):

   ```bash
   # macOS
   brew install awscli

   # Or download from: https://aws.amazon.com/cli/
   ```

## Usage

### Using npm Scripts

```bash
# Preview what would be deleted (safe, no changes)
npm run r2:clear:dry-run

# Delete all files from R2 bucket
npm run r2:clear
```

### Using Script Directly

```bash
# Dry run
node scripts/clear-r2.js --dry-run

# Actually delete
node scripts/clear-r2.js

# Custom bucket name
node scripts/clear-r2.js --bucket-name my-custom-bucket
```

### Using Bash Script (Alternative)

The original bash script is also available:

```bash
# Requires AWS CLI and R2 credentials
export R2_ACCESS_KEY_ID='your-key'
export R2_SECRET_ACCESS_KEY='your-secret'
export CF_ACCOUNT_ID='f67932e71175b3ee7c945c6bb84c5259'

./scripts/clear-r2-simple.sh
```

## What Gets Deleted

**⚠️ Warning**: This will delete ALL files in the R2 bucket!

- All uploaded files
- All file metadata objects
- All staging files
- All nested directory structures

**What Gets Preserved**:

- The bucket itself (not deleted)
- Bucket configuration
- Bucket permissions

## Methods Used

The script tries multiple methods in order:

1. **Cloudflare API** (Preferred)
   - Uses `CLOUDFLARE_API_TOKEN`
   - Direct API calls to Cloudflare
   - Most reliable and fastest

2. **AWS CLI with R2 Credentials** (Fallback)
   - Uses `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
   - Requires AWS CLI installed
   - Uses S3-compatible API

## Integration with Database Reset

When resetting production data, R2 cleanup is included:

```bash
# This clears database, R2, and Vectorize
./scripts/reset-and-apply-clean-slate.sh production
```

Or separately:

```bash
# Clear database
./scripts/reset-and-apply-clean-slate.sh production

# Clear R2 separately
npm run r2:clear
```

## Troubleshooting

### "Missing CLOUDFLARE_API_TOKEN"

**Solution**: Set the token as described in Option 1 above.

### "API Error: 401 Unauthorized"

**Solution**:

- Check that your API token is valid
- Ensure token has R2:Edit permissions
- Token may have expired, create a new one

### "API Error: 403 Forbidden"

**Solution**:

- Check that your API token has the correct permissions
- Verify the account ID is correct
- Ensure the bucket name is correct

### AWS CLI Errors

If using AWS CLI method:

- Ensure AWS CLI is installed: `aws --version`
- Verify credentials are set correctly
- Check that R2 endpoint is accessible

## Safety Features

- **Dry Run Mode**: Always test with `--dry-run` first
- **Batch Processing**: Deletes files in batches to handle large buckets
- **Error Handling**: Continues processing even if individual files fail
- **Progress Feedback**: Shows detailed progress during deletion

## Example Output

```
🗂️  R2 Storage Cleanup
======================
📦 Bucket: loresmith-files
🏢 Account: f67932e71175b3ee7c945c6bb84c5259

🔑 Using Cloudflare API...
📋 Fetching objects...
📊 Found 15 objects in this batch
🗑️  Deleted: users/123/file.pdf
🗑️  Deleted: staging/temp-abc123
...
✅ Reached end of object listing

🎉 R2 cleanup completed!
   📊 Total deleted: 15 objects
```

## References

- [Cloudflare R2 API Documentation](https://developers.cloudflare.com/r2/api/)
- [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [R2 API Tokens](https://developers.cloudflare.com/r2/api/s3/tokens/)
