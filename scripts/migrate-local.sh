#!/bin/bash

# Wrapper script for local migrations
# This calls the unified migrate.sh script with 'local' argument

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/migrate.sh" local

