#!/bin/bash

# LoreSmith AI Development Environment Setup Script
# This script helps set up the development environment for LoreSmith AI

set -e

echo "🚀 Setting up LoreSmith AI Development Environment"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    print_error "Wrangler CLI is not installed. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in to Cloudflare
if ! wrangler whoami &> /dev/null; then
    print_error "You are not logged in to Cloudflare. Please run:"
    echo "wrangler login"
    exit 1
fi

print_status "Checking current Cloudflare account..."
ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}')
print_success "Using Cloudflare account: $ACCOUNT_ID"

# Create .dev.vars from template if it doesn't exist
if [ ! -f ".dev.vars" ]; then
    print_status "Creating .dev.vars from template..."
    cp .dev.vars.template .dev.vars
    print_warning "Please edit .dev.vars with your actual values before continuing"
    print_warning "You'll need to set:"
    echo "  - ADMIN_SECRET"
    echo ""
    read -p "Press Enter when you've updated .dev.vars..."
fi

# Update wrangler.dev.jsonc with actual account ID
print_status "Updating wrangler.dev.jsonc with your account ID..."
sed -i.bak "s/YOUR_DEV_ACCOUNT_ID/$ACCOUNT_ID/g" wrangler.dev.jsonc
rm wrangler.dev.jsonc.bak
print_success "Updated account ID in wrangler.dev.jsonc"

# Create R2 bucket
print_status "Creating R2 bucket for development..."
if wrangler r2 bucket create loresmith-files-dev --config wrangler.dev.jsonc; then
    print_success "R2 bucket 'loresmith-files-dev' created"
else
    print_warning "R2 bucket might already exist or creation failed"
fi

# Create D1 database
print_status "Creating D1 database for development..."
if wrangler d1 create loresmith-db-dev --config wrangler.dev.jsonc; then
    print_success "D1 database 'loresmith-db-dev' created"
    print_warning "Please update the database_id in wrangler.dev.jsonc with the ID shown above"
else
    print_warning "D1 database might already exist or creation failed"
fi

# Create Vectorize index
print_status "Creating Vectorize index for development..."
if wrangler vectorize create loresmith-embeddings-dev --config wrangler.dev.jsonc --dimensions=768 --metric=cosine; then
    print_success "Vectorize index 'loresmith-embeddings-dev' created"
else
    print_warning "Vectorize index might already exist or creation failed"
fi

# Create queues
print_status "Creating queues for development..."
if wrangler queues create upload-events-dev --config wrangler.dev.jsonc; then
    print_success "Queue 'upload-events-dev' created"
else
    print_warning "Queue might already exist or creation failed"
fi

if wrangler queues create file-processing-dlq-dev --config wrangler.dev.jsonc; then
    print_success "Queue 'file-processing-dlq-dev' created"
else
    print_warning "Queue might already exist or creation failed"
fi

# Run database migrations
print_status "Running database migrations..."
if wrangler d1 migrations apply loresmith-db-dev --config wrangler.dev.jsonc; then
    print_success "Database migrations applied"
else
    print_warning "Database migrations might have failed or already applied"
fi

print_success "Development environment setup complete!"
echo ""
print_warning "Next steps:"
echo "1. Update wrangler.dev.jsonc with the correct database_id from the D1 creation output"
echo "2. Run 'npm run dev' to start the development server"
echo ""
print_status "For more detailed instructions, see docs/dev-setup.md"
