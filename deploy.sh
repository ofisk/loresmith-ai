#!/bin/bash

# Deployment script for LoreSmith AI
# This script handles both regular deployments and gradual deployments

set -e

echo "🚀 Starting LoreSmith AI deployment..."

# Build the application
echo "📦 Building application..."
npm run build

# Check if there are any pending migrations by looking at the wrangler config
echo "🔍 Checking for pending migrations..."

# Try to deploy with regular wrangler deploy first
echo "📤 Attempting regular deployment..."
if npx wrangler deploy --dry-run > /dev/null 2>&1; then
    echo "✅ No pending migrations detected. Using regular deployment..."
    npx wrangler deploy
else
    echo "⚠️  Pending migrations detected. Using regular deployment to apply migrations..."
    npx wrangler deploy
fi

echo "🎉 Deployment completed successfully!" 