#!/usr/bin/env bash
# One-time: apply migration 0021_drop_unreferenced_d1_tables.sql to drop three unused D1
# tables (see migration file). Uses wrangler; same as npm run migrate:prod:apply.
#
# After this runs successfully, you can delete this script from the repo.
#
# Safety: set CONFIRM_DROP_UNREFERENCED_D1_TABLES=1
#
# Usage (production):
#   CONFIRM_DROP_UNREFERENCED_D1_TABLES=1 ./scripts/d1/d1-one-time-apply-prod-drop-dead-tables.sh
#
# Remote dev (same migration file):
#   CONFIRM_DROP_UNREFERENCED_D1_TABLES=1 ./scripts/d1/d1-one-time-apply-prod-drop-dead-tables.sh loresmith-db-dev wrangler.local.jsonc
#
# For preview D1, add --preview to the wrangler command in this file or run npm run migrate:* locally.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ -z "${CONFIRM_DROP_UNREFERENCED_D1_TABLES:-}" ]]; then
	echo "Set CONFIRM_DROP_UNREFERENCED_D1_TABLES=1 after reviewing migrations/0021_drop_unreferenced_d1_tables.sql" >&2
	exit 1
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && ! npx wrangler whoami &>/dev/null; then
	echo "Set CLOUDFLARE_API_TOKEN or run: npx wrangler login" >&2
	exit 1
fi

DB="${1:-loresmith-db}"
CFG="${2:-wrangler.jsonc}"

exec npx wrangler d1 migrations apply "$DB" --config "$CFG" --remote
