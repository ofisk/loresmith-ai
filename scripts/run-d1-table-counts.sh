#!/usr/bin/env bash
# Remote D1 row counts (see scripts/d1-cleanup-candidate-counts.sql).
#
# Triage “unused” tables: (1) run this; (2) rg each table name in the repo
#    rg -F "table_name" --glob '!migrations/**' .
# Zero or tiny row count and no references outside migrations → strong candidate.
# Optional FTS5 shadow tables: scripts/d1-fts-shadow-counts.sql (run only if those tables exist).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && ! npx wrangler whoami &>/dev/null; then
	echo "Set CLOUDFLARE_API_TOKEN or run: npx wrangler login" >&2
	exit 1
fi

DB_DEV="${1:-loresmith-db-dev}"
CFG_DEV="${2:-wrangler.local.jsonc}"
SQL_F="scripts/d1-cleanup-candidate-counts.sql"
# Wrangler 4.x often does not return SELECT result rows for --file; inlining as --command does.
Q=$(sed '/^--/d' "$SQL_F" | tr '\n' ' ')

npx wrangler d1 execute "$DB_DEV" --config "$CFG_DEV" --remote -y --json --command "$Q" 2>/dev/null \
	| (command -v jq &>/dev/null && jq -r '.[0].results[0] // .' || cat)

echo
echo "Prod: DB_PROD=loresmith-db CFG=wrangler.jsonc (same inlining: see comment block at top of $SQL_F)"
