#!/bin/bash

# LoreSmith AI Development Environment Validation Script
# This script validates that the development environment is properly set up

set -e

echo "🔍 Validating LoreSmith AI Development Environment"
echo "================================================="

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

VALIDATION_PASSED=true

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    print_error "Wrangler CLI is not installed"
    VALIDATION_PASSED=false
else
    print_success "Wrangler CLI is installed"
fi

# Check if user is logged in to Cloudflare
if ! wrangler whoami &> /dev/null; then
    print_error "You are not logged in to Cloudflare. Run: wrangler login"
    VALIDATION_PASSED=false
else
    print_success "Logged in to Cloudflare"
fi

# Check if .dev.vars exists
if [ ! -f ".dev.vars" ]; then
    print_error ".dev.vars file not found. Copy from .dev.vars.template and fill in values"
    VALIDATION_PASSED=false
else
    print_success ".dev.vars file exists"
fi

# Check if wrangler.dev.jsonc exists
if [ ! -f "wrangler.dev.jsonc" ]; then
    print_error "wrangler.dev.jsonc file not found"
    VALIDATION_PASSED=false
else
    print_success "wrangler.dev.jsonc file exists"
fi

# Check if R2 bucket exists
print_status "Checking R2 bucket..."
if wrangler r2 bucket list --config wrangler.dev.jsonc | grep -q "loresmith-files-dev"; then
    print_success "R2 bucket 'loresmith-files-dev' exists"
else
    print_error "R2 bucket 'loresmith-files-dev' not found"
    VALIDATION_PASSED=false
fi

# Check if D1 database exists
print_status "Checking D1 database..."
if wrangler d1 list --config wrangler.dev.jsonc | grep -q "loresmith-db-dev"; then
    print_success "D1 database 'loresmith-db-dev' exists"
else
    print_error "D1 database 'loresmith-db-dev' not found"
    VALIDATION_PASSED=false
fi

# Check if Vectorize index exists
print_status "Checking Vectorize index..."
if wrangler vectorize list --config wrangler.dev.jsonc | grep -q "loresmith-embeddings-dev"; then
    print_success "Vectorize index 'loresmith-embeddings-dev' exists"
else
    print_error "Vectorize index 'loresmith-embeddings-dev' not found"
    VALIDATION_PASSED=false
fi

# Check if queues exist
print_status "Checking queues..."
if wrangler queues list --config wrangler.dev.jsonc | grep -q "upload-events-dev"; then
    print_success "Queue 'upload-events-dev' exists"
else
    print_error "Queue 'upload-events-dev' not found"
    VALIDATION_PASSED=false
fi

if wrangler queues list --config wrangler.dev.jsonc | grep -q "file-processing-dlq-dev"; then
    print_success "Queue 'file-processing-dlq-dev' exists"
else
    print_error "Queue 'file-processing-dlq-dev' not found"
    VALIDATION_PASSED=false
fi

# Check if secrets are set
print_status "Checking secrets..."
if wrangler secret list --config wrangler.dev.jsonc | grep -q "AUTORAG_API_TOKEN"; then
    print_success "AUTORAG_API_TOKEN secret is set"
else
    print_warning "AUTORAG_API_TOKEN secret is not set. Run: wrangler secret put AUTORAG_API_TOKEN --config wrangler.dev.jsonc"
fi

# Check if database migrations are applied
print_status "Checking database migrations..."
if wrangler d1 migrations list loresmith-db-dev --config wrangler.dev.jsonc | grep -q "v8"; then
    print_success "Database migrations are up to date"
else
    print_warning "Database migrations might not be applied. Run: npm run migrate:dev"
fi

echo ""
if [ "$VALIDATION_PASSED" = true ]; then
    print_success "✅ Development environment validation passed!"
    echo ""
    print_status "You can now run:"
    echo "  npm run dev:cloudflare  # Start development server with Cloudflare services"
    echo "  npm run start          # Start frontend development server"
else
    print_error "❌ Development environment validation failed!"
    echo ""
    print_status "Please fix the issues above and run this script again."
    exit 1
fi
