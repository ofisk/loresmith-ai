#!/bin/bash

# Regenerate embeddings for all files that have been added to campaigns
# This script deletes the Vectorize index, recreates it, and regenerates
# embeddings for all files linked to campaigns.

set -e

source "$(dirname "$0")/common.sh"

ENVIRONMENT="${1:-production}"
REMOTE_FLAG=""
ENV_LABEL=""

if [ "$ENVIRONMENT" == "production" ]; then
    REMOTE_FLAG="--remote"
    ENV_LABEL="Production"
    echo "🔄 Regenerating embeddings in PRODUCTION..."
else
    ENV_LABEL="Development"
    echo "🔄 Regenerating embeddings in DEVELOPMENT..."
fi

echo ""
echo "⚠️  This will:"
echo "   1. Delete the Vectorize index (all embeddings will be lost)"
echo "   2. Recreate the Vectorize index"
echo "   3. Regenerate embeddings for all files added to campaigns"
echo ""
confirm_action "Are you sure you want to continue?"

echo ""
echo "📊 Step 1: Resetting Vectorize index..."
reset_vectorize_index

echo ""
echo "🔄 Step 2: Regenerating embeddings from campaign files..."
echo "   This may take a while depending on the number of files..."
echo ""
echo "✅ To regenerate embeddings, call the admin API endpoint."
echo ""
if [ "$ENVIRONMENT" == "production" ]; then
    ENDPOINT="https://loresmith-ai.oren-t-fisk.workers.dev"
    echo "   Production endpoint is: $ENDPOINT"
else
    ENDPOINT="http://localhost:8787"
    echo "   Make sure your worker is running: npm run dev"
fi
echo ""
echo "   1. First, authenticate to get a JWT token:"
echo ""
echo "      curl -X POST $ENDPOINT/authenticate \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"username\":\"your-username\",\"adminSecret\":\"your-admin-secret\"}'"
echo ""
echo "   2. Copy the 'token' from the response, then call the endpoint:"
echo ""
echo "      curl -X POST $ENDPOINT/api/admin/regenerate-embeddings \\"
echo "        -H 'Authorization: Bearer YOUR_JWT_TOKEN' \\"
echo "        -H 'Content-Type: application/json'"
echo ""
echo "   Note: You must use ADMIN_SECRET when authenticating to get admin access"
echo ""
