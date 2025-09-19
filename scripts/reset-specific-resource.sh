#!/usr/bin/env bash
set -euo pipefail

# Script to reset specific Cloudflare resources without full recreation
# Usage: ./scripts/reset-specific-resource.sh [worker|queues|d1|r2|vectorize|all]

RESOURCE="${1:-all}"
read -p "Enter your Cloudflare Account ID: " ACCOUNT_ID
WORKER_NAME="loresmith-ai"
D1_NAME="loresmith-db"
R2_BUCKET="loresmith-files"
VECTORIZE_INDEX="loresmith-embeddings"
QUEUE_MAIN="upload-events"
QUEUE_DLQ="file-processing-dlq"

log() {
  echo "==> $*"
}

reset_worker() {
  log "Resetting Worker..."
  
  # Remove queue consumers first
  wrangler queues consumer remove "${QUEUE_MAIN}" "${WORKER_NAME}" 2>/dev/null || true
  wrangler queues consumer remove "${QUEUE_DLQ}" "${WORKER_NAME}" 2>/dev/null || true
  
  # Create temp config without queues
  cp wrangler.jsonc .wrangler.temp.jsonc
  sed -i '' '59,77d' .wrangler.temp.jsonc
  
  # Deploy temp config, delete queues, delete worker
  wrangler deploy --config .wrangler.temp.jsonc >/dev/null 2>&1
  yes | wrangler queues delete "${QUEUE_MAIN}" 2>/dev/null || true
  yes | wrangler queues delete "${QUEUE_DLQ}" 2>/dev/null || true
  wrangler delete "${WORKER_NAME}" >/dev/null 2>&1 || true
  
  # Recreate queues and deploy
  wrangler queues create "${QUEUE_MAIN}"
  wrangler queues create "${QUEUE_DLQ}"
  npm run build
  wrangler deploy
  
  # Cleanup
  rm -f .wrangler.temp.jsonc
}

reset_queues() {
  log "Resetting Queues..."
  
  # Remove consumers
  wrangler queues consumer remove "${QUEUE_MAIN}" "${WORKER_NAME}" 2>/dev/null || true
  wrangler queues consumer remove "${QUEUE_DLQ}" "${WORKER_NAME}" 2>/dev/null || true
  
  # Delete and recreate
  yes | wrangler queues delete "${QUEUE_MAIN}" 2>/dev/null || true
  yes | wrangler queues delete "${QUEUE_DLQ}" 2>/dev/null || true
  wrangler queues create "${QUEUE_MAIN}"
  wrangler queues create "${QUEUE_DLQ}"
  
  # Redeploy to reattach consumers
  npm run build
  wrangler deploy
}

reset_d1() {
  log "Resetting D1 Database..."
  wrangler d1 delete "${D1_NAME}" --yes 2>/dev/null || true
  wrangler d1 create "${D1_NAME}"
  
  # Apply migrations
  if [ -d "./migrations" ]; then
    for f in ./migrations/*.sql; do
      [ -e "$f" ] || continue
      log "Applying migration: $f"
      wrangler d1 execute "${D1_NAME}" --file "$f"
    done
  fi
}

reset_r2() {
  log "Resetting R2 Bucket..."
  wrangler r2 bucket delete "${R2_BUCKET}" --force 2>/dev/null || true
  wrangler r2 bucket create "${R2_BUCKET}" 2>/dev/null || true
}

reset_vectorize() {
  log "Resetting Vectorize Index..."
  wrangler vectorize delete "${VECTORIZE_INDEX}" --yes 2>/dev/null || true
  wrangler vectorize create "${VECTORIZE_INDEX}"
}

case "${RESOURCE}" in
  "worker")
    reset_worker
    ;;
  "queues")
    reset_queues
    ;;
  "d1")
    reset_d1
    ;;
  "r2")
    reset_r2
    ;;
  "vectorize")
    reset_vectorize
    ;;
  "all")
    reset_worker
    reset_d1
    reset_r2
    reset_vectorize
    ;;
  *)
    echo "Usage: $0 [worker|queues|d1|r2|vectorize|all]"
    exit 1
    ;;
esac

log "Reset complete for: ${RESOURCE}"
