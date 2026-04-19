#!/usr/bin/env bash
# Call LoreSmith graph-rebuild APIs: active → cancel (if any) → trigger.
#
# Usage:
#   export LORESMITH_JWT="eyJ..."   # Browser: localStorage key "loresmith-jwt" (while logged in)
#   export LORESMITH_CAMPAIGN_ID="uuid"
#   ./scripts/graph-rebuild-unstick.sh
#
# Optional:
#   LORESMITH_API_BASE   default https://loresmith.ai
#   SKIP_CANCEL=1        skip cancel; only GET active + POST trigger

set -euo pipefail

BASE="${LORESMITH_API_BASE:-https://loresmith.ai}"
BASE="${BASE%/}"

if [[ -z "${LORESMITH_JWT:-}" ]]; then
	echo "Set LORESMITH_JWT to your session JWT (Application → Local Storage → loresmith-jwt on loresmith.ai)." >&2
	exit 1
fi
if [[ -z "${LORESMITH_CAMPAIGN_ID:-}" ]]; then
	echo "Set LORESMITH_CAMPAIGN_ID to the campaign UUID." >&2
	exit 1
fi

hdr_auth=( -H "Authorization: Bearer ${LORESMITH_JWT}" )
hdr_json=( -H "Content-Type: application/json" )

ACTIVE_URL="${BASE}/api/campaigns/${LORESMITH_CAMPAIGN_ID}/graph-rebuild/active"

echo "=== GET ${ACTIVE_URL}"
ACTIVE_JSON="$(curl -sS "${ACTIVE_URL}" "${hdr_auth[@]}")"
echo "${ACTIVE_JSON}" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (d.error) { console.error('Error:', d.error); process.exit(2); }
const r = d.rebuilds || [];
console.log('rebuilds count:', r.length);
for (const x of r) console.log(' -', x.id, x.status, x.rebuildType);
"

ACTIVE_IDS="$(echo "${ACTIVE_JSON}" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (d.error) process.exit(2);
const ids = (d.rebuilds || [])
  .filter((x) => x.status === 'pending' || x.status === 'in_progress')
  .map((x) => x.id);
process.stdout.write(ids.join('\\n'));
")"

if [[ "${SKIP_CANCEL:-0}" != "1" && -n "${ACTIVE_IDS}" ]]; then
	echo ""
	echo "=== Cancelling ${ACTIVE_IDS//$'\n'/, }"
	while IFS= read -r REBUILD_ID; do
		[[ -z "${REBUILD_ID}" ]] && continue
		CANCEL_URL="${BASE}/api/campaigns/${LORESMITH_CAMPAIGN_ID}/graph-rebuild/cancel/${REBUILD_ID}"
		echo "=== POST ${CANCEL_URL}"
		curl -sS -X POST "${CANCEL_URL}" "${hdr_auth[@]}" | node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')), null, 2))"
	done <<< "${ACTIVE_IDS}"
elif [[ "${SKIP_CANCEL:-0}" == "1" ]]; then
	echo ""
	echo "=== SKIP_CANCEL=1 — not calling cancel"
else
	echo ""
	echo "=== No pending/in_progress rebuild — skipping cancel"
fi

TRIGGER_URL="${BASE}/api/campaigns/${LORESMITH_CAMPAIGN_ID}/graph-rebuild/trigger"
echo ""
echo "=== POST ${TRIGGER_URL}"
curl -sS -X POST "${TRIGGER_URL}" "${hdr_auth[@]}" "${hdr_json[@]}" -d '{}' | node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')), null, 2))"

echo ""
echo "Done."
