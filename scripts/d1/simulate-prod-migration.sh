#!/bin/bash
# Rehearse, against a local D1, exactly what production does on merge:
# rebuild the database as it exists at the base ref, then apply only the
# migrations this branch adds.
#
# This is the check that a new migration's SQL is valid against the REAL prior
# schema. `wrangler d1 migrations apply` on a fully bootstrapped database cannot
# tell you that, because bootstrap seeds d1_migrations from filenames and so
# marks the new file applied without ever running it.
#
# Local D1 state under .wrangler/state/v3/d1 is DESTROYED. That is fine — it is
# rebuilt from scripts/d1/d1-bootstrap.sql.
#
# Usage: ./scripts/d1/simulate-prod-migration.sh [base-ref]   (default origin/main)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

BASE_REF="${1:-${MIGRATION_BASE_REF:-origin/main}}"
SWAPPED_PATHS="migrations scripts/d1/d1-bootstrap.sql"

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
	echo "Base ref '$BASE_REF' not found. Run: git fetch origin main"
	exit 1
fi

# This script rewrites these paths from the base ref and then restores them from
# HEAD, so uncommitted work in them would be lost. Refuse rather than destroy it.
if [ -n "$(git status --porcelain -- $SWAPPED_PATHS)" ]; then
	echo "Uncommitted changes in: $SWAPPED_PATHS"
	echo "Commit or stash them first — this script rewrites those paths from $BASE_REF."
	exit 1
fi

restore_tree() {
	rm -rf migrations
	git checkout HEAD -- $SWAPPED_PATHS
}
trap restore_tree EXIT

echo "Rebuilding a local database at $BASE_REF..."
rm -rf .wrangler/state/v3/d1
rm -rf migrations
git checkout "$BASE_REF" -- $SWAPPED_PATHS
npm run migrate:bootstrap:local

echo ""
echo "Restoring this branch and applying only its new migrations..."
restore_tree
trap - EXIT

node "$SCRIPT_DIR/ci-apply-migrations.mjs" \
	--config wrangler.local.jsonc --database loresmith-db-dev --local

echo ""
echo "Simulation passed: this branch's migrations apply cleanly to a $BASE_REF database."
