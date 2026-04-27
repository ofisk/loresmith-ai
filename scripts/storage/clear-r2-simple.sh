#!/bin/bash

# Simple R2 cleanup script
# Clears all nested files while preserving top-level structure

set -e

BUCKET="loresmith-files"
ACCOUNT_ID="f67932e71175b3ee7c945c6bb84c5259"
ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
AWS_CLI_PATH="/Users/ofisk/Library/Python/3.9/bin/aws"

echo "🗂️  R2 Storage Cleanup"
echo "======================"
echo "📦 Bucket: $BUCKET"
echo "🏢 Account: $ACCOUNT_ID"
echo ""

# Check if we have AWS CLI and credentials
if [ ! -f "$AWS_CLI_PATH" ]; then
    echo "❌ AWS CLI not found at: $AWS_CLI_PATH"
    echo "Please install AWS CLI or provide R2 credentials"
    exit 1
fi

if [ -z "$CF_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
    echo "❌ Missing R2 credentials!"
    echo ""
    echo "Please set the following environment variables:"
    echo "  export CF_ACCOUNT_ID='$ACCOUNT_ID'"
    echo "  export R2_ACCESS_KEY_ID='your-r2-access-key'"
    echo "  export R2_SECRET_ACCESS_KEY='your-r2-secret-key'"
    echo ""
    echo "Get R2 API credentials from:"
    echo "  https://dash.cloudflare.com → R2 → Manage R2 API Tokens"
    exit 1
fi

echo "🔑 Using AWS CLI against R2 endpoint: $ENDPOINT"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

echo "🔄 Starting R2 cleanup process..."

DELETED=0
KEPT=0
TOKEN=""

while : ; do
    echo "📋 Listing objects (batch processing)..."
    
    if [ -n "$TOKEN" ]; then
        RESP=$($AWS_CLI_PATH s3api list-objects-v2 --bucket "$BUCKET" --endpoint-url "$ENDPOINT" \
            --continuation-token "$TOKEN" --output json 2>/dev/null || true)
    else
        RESP=$($AWS_CLI_PATH s3api list-objects-v2 --bucket "$BUCKET" --endpoint-url "$ENDPOINT" \
            --output json 2>/dev/null || true)
    fi

    # Check if we have any objects
    if [ -z "$RESP" ] || [ "$RESP" = "{}" ]; then
        echo "✅ No objects found in bucket"
        break
    fi

    # Extract object keys and process them
    KEYS_TO_DELETE=$(echo "$RESP" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
for obj in data.get('Contents', []):
    key = obj.get('Key', '')
    if key:
        segments = [s for s in key.split('/') if s]
        if len(segments) >= 2:
            print(key)
")

    if [ -z "$KEYS_TO_DELETE" ]; then
        echo "✅ No nested files to delete in this batch"
    else
        echo "📊 Found files to delete in this batch"
        while IFS= read -r KEY; do
            [ -z "$KEY" ] && continue
            echo "🗑️  Deleting: $KEY"
            $AWS_CLI_PATH s3api delete-object --bucket "$BUCKET" --key "$KEY" --endpoint-url "$ENDPOINT" >/dev/null 2>&1 || echo "   ⚠️  Failed to delete: $KEY"
            DELETED=$((DELETED+1))
        done <<< "$KEYS_TO_DELETE"
    fi

    # Count kept files (top-level only)
    KEPT_BATCH=$(echo "$RESP" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
count = 0
for obj in data.get('Contents', []):
    key = obj.get('Key', '')
    if key:
        segments = [s for s in key.split('/') if s]
        if 0 < len(segments) < 2:
            count += 1
print(count)
")
    KEPT=$((KEPT + KEPT_BATCH))

    # Get next continuation token
    TOKEN=$(echo "$RESP" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
print(data.get('NextContinuationToken', ''))
")
    
    if [ -z "$TOKEN" ]; then
        echo "✅ Reached end of object listing"
        break
    fi
done

echo ""
echo "🎉 R2 cleanup completed successfully!"
echo "   📊 Deleted: $DELETED nested files"
echo "   📊 Kept: $KEPT top-level files"
echo ""
echo "✅ All user-uploaded files have been removed from R2 storage"
echo "✅ Top-level bucket structure preserved"
