#!/bin/bash

# Wrapper: apply pending D1 migrations to local Miniflare (see ../d1/migrate.sh).
# For broken local schema or journal drift, local data loss is fine — from repo root run:
#   npm run migrate:local:reset

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../d1/migrate.sh" local

