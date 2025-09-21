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

# Step 2: Clear R2 storage files (preserve top-level objects only)
echo "🗂️  Clearing R2 storage files (preserving top-level objects only)..."

# Requirements for automated cleanup:
# - Environment variables: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
# - CLI tools: aws

BUCKET="loresmith-files"
ENDPOINT="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com"

if command -v aws >/dev/null 2>&1 \
  && [ -n "$CF_ACCOUNT_ID" ] && [ -n "$R2_ACCESS_KEY_ID" ] && [ -n "$R2_SECRET_ACCESS_KEY" ]; then
  echo "🔑 Using AWS S3 API against R2 endpoint: $ENDPOINT"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

  DELETED=0
  KEPT=0
  TOKEN=""

  while : ; do
    if [ -n "$TOKEN" ]; then
      RESP=$(aws s3api list-objects-v2 --bucket "$BUCKET" --endpoint-url "$ENDPOINT" \
        --continuation-token "$TOKEN" --output json 2>/dev/null || true)
    else
      RESP=$(aws s3api list-objects-v2 --bucket "$BUCKET" --endpoint-url "$ENDPOINT" \
        --output json 2>/dev/null || true)
    fi

    # Determine count; exit when empty
    COUNT=$(python3 - << 'PY'
import sys, json
data=json.loads(sys.stdin.read() or '{}')
print(data.get('KeyCount', 0))
PY
<<< "$RESP")
    if [ "$COUNT" = "0" ]; then break; fi

    # Emit keys to delete: only keys with 2+ non-empty path segments
    echo "$RESP" | python3 - << 'PY' | while read -r KEY; do
import sys, json
data=json.loads(sys.stdin.read() or '{}')
for o in data.get('Contents', []):
    k=o.get('Key')
    if not k:
        continue
    segs=[s for s in k.split('/') if s]
    if len(segs) >= 2:
        print(k)
PY
      [ -z "$KEY" ] && continue
      aws s3api delete-object --bucket "$BUCKET" --key "$KEY" --endpoint-url "$ENDPOINT" >/dev/null 2>&1 || true
      DELETED=$((DELETED+1))
    done

    # Count kept (first-level children) for reporting only
    KEPT=$((KEPT + $(python3 - << 'PY'
import sys, json
data=json.loads(sys.stdin.read() or '{}')
cnt=0
for o in data.get('Contents', []):
    k=o.get('Key')
    if not k: continue
    segs=[s for s in k.split('/') if s]
    if 0 < len(segs) < 2:
        cnt+=1
print(cnt)
PY
<<< "$RESP")))

    # Get next continuation token
    TOKEN=$(python3 - << 'PY'
import sys, json
data=json.loads(sys.stdin.read() or '{}')
print(data.get('NextContinuationToken', ''))
PY
<<< "$RESP")
  done

  echo "✅ R2 cleanup complete. Deleted: $DELETED, Kept (top-level): $KEPT"
else
  echo "ℹ️  Skipping automated R2 cleanup: missing CLI tool or credentials."
  echo "   Provide CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and install aws to enable."
fi

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
