#!/bin/bash
# Run EXPLAIN QUERY PLAN on hot D1 query paths (issue #490).
# Usage: ./scripts/d1/d1-explain-audit.sh [dev|local|prod]
# Output: docs/database/explain-results.md
# Requires: migrations 0014 and 0015 applied (for performance indexes). Run npm run migrate:dev first.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCS_DIR="$ROOT_DIR/docs/database"
OUTPUT="$DOCS_DIR/explain-results.md"

cd "$ROOT_DIR"

# Suppress wrangler stderr (log file EPERM, etc.) so JSON extraction works
# WRANGLER_LOG=warn can help but we use 2>/dev/null in run_explain

ENV="${1:-dev}"
if [ "$ENV" = "local" ]; then
	DB_NAME="loresmith-db"
	CONFIG="wrangler.local.jsonc"
	REMOTE="--local"
elif [ "$ENV" = "prod" ]; then
	DB_NAME="loresmith-db"
	CONFIG="wrangler.jsonc"
	REMOTE="--remote"
else
	DB_NAME="loresmith-db-dev"
	CONFIG="wrangler.dev.jsonc"
	REMOTE="--remote"
fi

echo "D1 EXPLAIN audit for $ENV ($DB_NAME) -> $OUTPUT"

run_explain() {
	local name="$1"
	local sql="$2"
	local raw json details
	raw=$(wrangler d1 execute "$DB_NAME" --config "$CONFIG" $REMOTE --command="EXPLAIN QUERY PLAN $sql" 2>/dev/null)
	json=$(echo "$raw" | sed -n '/^\[/,/^\]/p')
	details=$(echo "$json" | jq -r '.[].results[]?.detail // empty' 2>/dev/null)
	echo "## $name"
	echo ""
	echo "Index usage:"
	if [ -n "$details" ]; then
		echo "$details" | sed 's/^/- /'
	else
		echo "- (no index plan extracted)"
	fi
	echo ""
}

mkdir -p "$DOCS_DIR"

{
	echo "# D1 EXPLAIN QUERY PLAN results"
	echo ""
	echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
	echo "Environment: $ENV"
	echo ""
	echo "---"
	echo ""

	run_explain "entities by id (batch)" "SELECT * FROM entities WHERE id IN ('id1', 'id2', 'id3')"
	run_explain "entities by campaign_id" "SELECT * FROM entities WHERE campaign_id = 'c1' ORDER BY updated_at DESC LIMIT 50"
	run_explain "entity_relationships UNION (from)" "SELECT * FROM entity_relationships WHERE from_entity_id IN ('e1', 'e2') ORDER BY created_at DESC"
	run_explain "entity_relationships UNION (to)" "SELECT * FROM entity_relationships WHERE to_entity_id IN ('e1', 'e2') ORDER BY created_at DESC"
	run_explain "entity_relationships by campaign and type" "SELECT * FROM entity_relationships WHERE campaign_id = 'c1' AND relationship_type = 'related_to' ORDER BY created_at DESC"
	run_explain "file_metadata by username" "SELECT * FROM file_metadata WHERE username = 'user1' ORDER BY created_at DESC"
	run_explain "campaigns by username" "SELECT * FROM campaigns WHERE username = 'user1' ORDER BY updated_at DESC"
	run_explain "campaign_resources by campaign" "SELECT * FROM campaign_resources WHERE campaign_id = 'c1' ORDER BY created_at DESC"
	run_explain "campaign_resources by campaign and file_key" "SELECT * FROM campaign_resources WHERE campaign_id = 'c1' AND file_key = 'fk1'"
	run_explain "shard_registry by campaign" "SELECT * FROM shard_registry WHERE campaign_id = 'c1' AND deleted_at IS NULL"

	# graph_dirty_relationships two-DELETE pattern (post-refactor)
	run_explain "graph_dirty_relationships delete by from_entity_id" "DELETE FROM graph_dirty_relationships WHERE campaign_id = 'c1' AND from_entity_id IN ('e1', 'e2')"
	run_explain "graph_dirty_relationships delete by to_entity_id" "DELETE FROM graph_dirty_relationships WHERE campaign_id = 'c1' AND to_entity_id IN ('e1', 'e2')"

	# entity_extraction_queue getPendingQueueItems
	run_explain "entity_extraction_queue pending items" "SELECT * FROM entity_extraction_queue WHERE status = 'pending' OR (status = 'rate_limited' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))) ORDER BY created_at ASC LIMIT 10"

	# entity_dao listEntities with json_each filter
	run_explain "entities listEntities with json_each" "SELECT * FROM entities WHERE campaign_id = 'c1' AND id IN (SELECT value FROM json_each('[\"e1\",\"e2\"]')) ORDER BY updated_at DESC"

	# getTwoHopNeighborhood full fetch
	run_explain "entity_relationships two-hop neighborhood" "SELECT from_entity_id, to_entity_id, metadata FROM entity_relationships WHERE campaign_id = 'c1' LIMIT 50000"

} > "$OUTPUT"

echo "Done. Results written to $OUTPUT"
