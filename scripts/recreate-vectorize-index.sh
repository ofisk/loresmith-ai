#!/bin/bash
# Recreate Vectorize index with correct dimensions (768 for BGE model)

source "$(dirname "$0")/common.sh"

ENVIRONMENT="${1:-production}"
REMOTE_FLAG=""
ENV_LABEL=""

if [ "$ENVIRONMENT" == "production" ]; then
    REMOTE_FLAG=""
    ENV_LABEL="Production"
    echo "🔄 Recreating Vectorize index in PRODUCTION..."
else
    REMOTE_FLAG="--remote"
    ENV_LABEL="Development"
    echo "🔄 Recreating Vectorize index in DEVELOPMENT..."
fi

echo ""
echo "⚠️  This will DELETE and recreate the Vectorize index with 768 dimensions."
echo "    All existing embeddings will be lost!"
echo ""
read -p "Are you sure? Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled."
    exit 1
fi

echo ""
reset_vectorize_index 768 cosine

echo ""
echo "✅ Vectorize index recreated successfully!"
echo "   Dimensions: 768"
echo "   Metric: cosine"
echo ""
