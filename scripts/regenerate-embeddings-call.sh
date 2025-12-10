#!/bin/bash

# Helper script to call the regenerate embeddings endpoint
# Usage: ./scripts/regenerate-embeddings-call.sh [username] [admin_secret] [endpoint]

set -e

ENDPOINT="${3:-https://loresmith-ai.oren-t-fisk.workers.dev}"
USERNAME="${1}"
ADMIN_SECRET="${2}"

if [ -z "$USERNAME" ]; then
    read -p "Enter your username: " USERNAME
fi

if [ -z "$ADMIN_SECRET" ]; then
    read -sp "Enter your admin secret: " ADMIN_SECRET
    echo ""
fi

if [ -z "$USERNAME" ] || [ -z "$ADMIN_SECRET" ]; then
    echo "❌ Error: Username and admin secret are required"
    echo "Usage: $0 [username] [admin_secret] [endpoint]"
    exit 1
fi

echo "🔄 Regenerating embeddings via API endpoint: $ENDPOINT"
echo ""

echo "📝 Step 1: Authenticating..."
echo ""

# Authenticate
AUTH_RESPONSE=$(curl -s -X POST "$ENDPOINT/authenticate" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"adminSecret\":\"$ADMIN_SECRET\"}")

# Check if authentication was successful
if echo "$AUTH_RESPONSE" | grep -q "token"; then
    # Extract token from response (assuming JSON format with "token" field)
    TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$TOKEN" ]; then
        # Try alternative JSON parsing
        TOKEN=$(echo "$AUTH_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
    fi
    
    if [ -z "$TOKEN" ]; then
        echo "❌ Error: Could not extract token from response"
        echo "Response: $AUTH_RESPONSE"
        exit 1
    fi
    
    echo "✅ Authentication successful"
    echo ""
    echo "🔄 Step 2: Regenerating embeddings..."
    echo "   This may take a while depending on the number of files..."
    echo ""
    
    # Call the regenerate endpoint
    RESULT=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT/api/admin/regenerate-embeddings" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json')
    
    HTTP_CODE=$(echo "$RESULT" | tail -n1)
    RESPONSE_BODY=$(echo "$RESULT" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "207" ]; then
        echo "✅ Regeneration completed!"
        echo ""
        echo "Response:"
        echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
    else
        echo "❌ Error: Regeneration failed with HTTP code $HTTP_CODE"
        echo ""
        echo "Response:"
        echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
        exit 1
    fi
else
    echo "❌ Error: Authentication failed"
    echo "Response: $AUTH_RESPONSE"
    exit 1
fi
