#!/bin/bash
# Install GitHub CLI and create the issue
# Run this script manually in your terminal

set -e

echo "=== Installing GitHub CLI to ~/bin ==="
mkdir -p ~/bin

# Download GitHub CLI for macOS ARM64
cd /tmp
curl -fsSL -L "https://github.com/cli/cli/releases/download/v2.40.1/gh_2.40.1_macOS_arm64.tar.gz" -o gh.tar.gz
echo "Extracting..."
tar -xzf gh.tar.gz
echo "Installing to ~/bin..."
cp gh_*/bin/gh ~/bin/gh
chmod +x ~/bin/gh

# Add to PATH for this session
export PATH="$HOME/bin:$PATH"

echo ""
echo "=== GitHub CLI installed! ==="
~/bin/gh --version

echo ""
echo "=== Authenticating with GitHub ==="
echo "You'll need to authenticate. Run this command:"
echo "  ~/bin/gh auth login"
echo ""
read -p "Press Enter after you've run 'gh auth login'..."

echo ""
echo "=== Creating GitHub issue ==="
cd /Users/ofisk/Documents/github/loresmith-ai
~/bin/gh issue create \
  --title "Fix type safety: STAGED_SHARDS API response should match StagedShardGroup interface" \
  --body-file .github/ISSUE_TYPE_SAFETY_STAGED_SHARDS.md

echo ""
echo "=== Done! ==="

# Cleanup
rm -rf /tmp/gh_* /tmp/gh.tar.gz 2>/dev/null || true

