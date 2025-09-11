#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Infrastructure Recreation Script
# This script tears down and recreates all Cloudflare infrastructure for LoreSmith AI
# Handles queue binding issues and other Cloudflare API quirks

# CONFIG: Update these if your names differ
read -p "Enter your Cloudflare Account ID: " ACCOUNT_ID
WORKER_NAME="loresmith-ai"
D1_NAME="loresmith-db"
R2_BUCKET="loresmith-files"
VECTORIZE_INDEX="loresmith-embeddings"
QUEUE_MAIN="upload-events"
QUEUE_DLQ="file-processing-dlq"

# Use the source config (Wrangler will auto-redirect to dist during build/deploy)
WRANGLER_CONFIG="wrangler.jsonc"
TEMP_CONFIG=".wrangler.no-queues.jsonc"

confirm() {
  read -r -p "This will DELETE and RECREATE Cloudflare resources for '${WORKER_NAME}'. Continue? (y/N) " resp
  [[ "${resp:-N}" == "y" || "${resp:-N}" == "Y" ]]
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

log() {
  echo "==> $*"
}

cleanup_temp_config() {
  if [ -f "${TEMP_CONFIG}" ]; then
    rm -f "${TEMP_CONFIG}"
    log "Cleaned up temporary config file"
  fi
}

# Cleanup on exit
trap cleanup_temp_config EXIT

# 1) Safety + prerequisites
require_cmd wrangler
require_cmd npm
wrangler whoami >/dev/null || { echo "Not logged in to Cloudflare. Run: wrangler login"; exit 1; }
confirm

log "Using account: ${ACCOUNT_ID}"
log "Worker: ${WORKER_NAME}"
log "D1: ${D1_NAME}"
log "R2 bucket: ${R2_BUCKET}"
log "Vectorize index: ${VECTORIZE_INDEX}"
log "Queues: ${QUEUE_MAIN}, ${QUEUE_DLQ}"

# 2) Handle Worker deletion with queue binding issues
log "Preparing to delete Worker (handling queue binding issues)..."

# First, try to remove queue consumers if they exist
log "Removing queue consumers (if any)..."
wrangler queues consumer remove "${QUEUE_MAIN}" "${WORKER_NAME}" 2>/dev/null || true
wrangler queues consumer remove "${QUEUE_DLQ}" "${WORKER_NAME}" 2>/dev/null || true

# Create temporary config without queue bindings to unbind the service
log "Creating temporary config without queue bindings..."
cp "${WRANGLER_CONFIG}" "${TEMP_CONFIG}"
# Remove the entire queues section (lines 59-77 in wrangler.jsonc)
sed -i '' '59,77d' "${TEMP_CONFIG}"

# Deploy with temporary config to unbind queues
log "Deploying temporary Worker without queue bindings..."
wrangler deploy --config "${TEMP_CONFIG}" >/dev/null 2>&1

# Now delete the queues
log "Deleting Queues..."
yes | wrangler queues delete "${QUEUE_MAIN}" 2>/dev/null || true
yes | wrangler queues delete "${QUEUE_DLQ}" 2>/dev/null || true

# Now delete the Worker
log "Deleting Worker..."
wrangler delete "${WORKER_NAME}" >/dev/null 2>&1 || true

# 3) Recreate Queues
log "Creating Queues..."
wrangler queues create "${QUEUE_MAIN}"
wrangler queues create "${QUEUE_DLQ}"

# 4) D1: delete then recreate
log "Deleting D1 database (if exists)..."
wrangler d1 delete "${D1_NAME}" --yes 2>/dev/null || true

log "Creating D1 database..."
wrangler d1 create "${D1_NAME}"

# Apply migrations if you keep SQL files in migrations/
if [ -d "./migrations" ]; then
  log "Applying D1 migrations from ./migrations..."
  for f in ./migrations/*.sql; do
    [ -e "$f" ] || continue
    log "Applying migration: $f"
    wrangler d1 execute "${D1_NAME}" --file "$f"
  done
fi

# 5) R2: delete then recreate bucket (WARNING: deletes all data)
log "Deleting R2 bucket (if exists)..."
wrangler r2 bucket delete "${R2_BUCKET}" --force 2>/dev/null || true

log "Creating R2 bucket..."
wrangler r2 bucket create "${R2_BUCKET}" 2>/dev/null || true

# 6) Vectorize: delete then recreate
log "Deleting Vectorize index (if exists)..."
wrangler vectorize delete "${VECTORIZE_INDEX}" --yes 2>/dev/null || true

log "Creating Vectorize index..."
wrangler vectorize create "${VECTORIZE_INDEX}"

# 7) Build (creates dist + redirected config)
log "Building project..."
npm run build

# 8) Deploy Worker (re-binds DO, Queues, D1, R2, Vectorize from wrangler.jsonc)
log "Deploying Worker with full configuration..."
wrangler deploy --config "${WRANGLER_CONFIG}"

# 9) Verify deployment
log "Verifying deployment..."
wrangler whoami
wrangler queues info "${QUEUE_MAIN}" >/dev/null 2>&1 && log "Queue ${QUEUE_MAIN} is active" || log "Warning: Queue ${QUEUE_MAIN} not found"
wrangler queues info "${QUEUE_DLQ}" >/dev/null 2>&1 && log "Queue ${QUEUE_DLQ} is active" || log "Warning: Queue ${QUEUE_DLQ} not found"
wrangler d1 info "${D1_NAME}" >/dev/null 2>&1 && log "D1 database ${D1_NAME} is active" || log "Warning: D1 database ${D1_NAME} not found"
wrangler r2 bucket list | grep -q "${R2_BUCKET}" && log "R2 bucket ${R2_BUCKET} is active" || log "Warning: R2 bucket ${R2_BUCKET} not found"
wrangler vectorize list | grep -q "${VECTORIZE_INDEX}" && log "Vectorize index ${VECTORIZE_INDEX} is active" || log "Warning: Vectorize index ${VECTORIZE_INDEX} not found"

log "Done. All Cloudflare resources were recreated and Worker redeployed."
log "Worker URL: https://${WORKER_NAME}.oren-t-fisk.workers.dev"
