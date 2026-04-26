#!/bin/bash

# Script to sync documentation files to GitHub Wiki
# This script clones the wiki repository, copies documentation files, and pushes changes

set -e

REPO_OWNER="ofisk"
REPO_NAME="loresmith-ai"
WIKI_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.wiki.git"
WIKI_DIR=".wiki-temp"
DOCS_DIR="docs"

echo "📚 Syncing documentation to GitHub Wiki..."
echo ""

# Check if we're in the right directory
if [ ! -d "$DOCS_DIR" ]; then
    echo "❌ Error: docs/ directory not found"
    echo "Please run this script from the project root"
    exit 1
fi

# Clean up any existing wiki clone
if [ -d "$WIKI_DIR" ]; then
    echo "🧹 Cleaning up existing wiki clone..."
    rm -rf "$WIKI_DIR"
fi

# Clone the wiki repository
echo "📥 Cloning wiki repository..."
git clone "$WIKI_URL" "$WIKI_DIR" || {
    echo "❌ Failed to clone wiki repository"
    echo ""
    echo "Note: The wiki must be initialized on GitHub first."
    echo "Go to https://github.com/${REPO_OWNER}/${REPO_NAME}/settings and enable the Wiki feature."
    exit 1
}

cd "$WIKI_DIR"

# Copy documentation files
echo "📋 Copying documentation files..."

# Copy main documentation files
cp "../${DOCS_DIR}/USER_GUIDE.md" "User-Guide.md" 2>/dev/null || echo "⚠️  User-Guide.md not found"
cp "../${DOCS_DIR}/FEATURES.md" "Features.md" 2>/dev/null || echo "⚠️  Features.md not found"
cp "../${DOCS_DIR}/ARCHITECTURE.md" "Architecture.md" 2>/dev/null || echo "⚠️  Architecture.md not found"
cp "../${DOCS_DIR}/API.md" "API-Reference.md" 2>/dev/null || echo "⚠️  API.md not found"

# Copy technical documentation
mkdir -p "Technical"
cp "../${DOCS_DIR}/GRAPHRAG_INTEGRATION.md" "Technical/GraphRAG-Integration.md" 2>/dev/null || echo "⚠️  GRAPHRAG_INTEGRATION.md not found"
cp "../${DOCS_DIR}/AUTHENTICATION_FLOW.md" "Technical/Authentication-Flow.md" 2>/dev/null || echo "⚠️  AUTHENTICATION_FLOW.md not found"
cp "../${DOCS_DIR}/STORAGE_STRATEGY.md" "Technical/Storage-Strategy.md" 2>/dev/null || echo "⚠️  STORAGE_STRATEGY.md not found"
cp "../${DOCS_DIR}/FILE_ANALYSIS_SYSTEM.md" "Technical/File-Analysis-System.md" 2>/dev/null || echo "⚠️  FILE_ANALYSIS_SYSTEM.md not found"

# Create or update Home.md with main README content
echo "📝 Creating/updating Home.md from README..."
if [ -f "../README.md" ]; then
    # Extract the main content from README (skip the title line)
    tail -n +2 "../README.md" > "Home.md"
    # Replace relative links to work in wiki
    sed -i '' 's|docs/\([^)]*\)|\\1|g' "Home.md" 2>/dev/null || sed -i 's|docs/\([^)]*\)|\\1|g' "Home.md"
fi

# Create a _Sidebar.md if it doesn't exist
if [ ! -f "_Sidebar.md" ]; then
    echo "📑 Creating sidebar navigation..."
    cat > "_Sidebar.md" << 'EOF'
## Getting Started
- [[Home|Home]]
- [[User-Guide|User Guide]]
- [[Features|Features]]

## For Developers
- [[Architecture|Architecture]]
- [[API-Reference|API Reference]]

## Technical Documentation
- [[Technical/GraphRAG-Integration|GraphRAG Integration]]
- [[Technical/Authentication-Flow|Authentication Flow]]
- [[Technical/Storage-Strategy|Storage Strategy]]
- [[Technical/File-Analysis-System|File Analysis System]]
EOF
fi

# Check for changes
if [ -z "$(git status --porcelain)" ]; then
    echo ""
    echo "✅ No changes to commit. Wiki is up to date."
    cd ..
    rm -rf "$WIKI_DIR"
    exit 0
fi

# Show what will be changed
echo ""
echo "📊 Changes to be committed:"
git status --short

# Commit changes
echo ""
read -p "Commit and push these changes? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    git add .
    git commit -m "Update wiki documentation from docs/ directory

- Sync user guide, features, and architecture documentation
- Update API reference
- Sync technical documentation
- Auto-generated from project documentation"

    echo ""
    echo "📤 Pushing changes to GitHub..."
    git push origin main || git push origin master || {
        echo "❌ Failed to push to wiki repository"
        echo ""
        echo "You may need to:"
        echo "1. Configure git credentials"
        echo "2. Enable wiki write access"
        echo "3. Check your GitHub authentication"
        cd ..
        rm -rf "$WIKI_DIR"
        exit 1
    }

    echo ""
    echo "✅ Successfully synced documentation to GitHub Wiki!"
    echo "   View at: https://github.com/${REPO_OWNER}/${REPO_NAME}/wiki"
else
    echo "❌ Operation cancelled."
fi

cd ..
rm -rf "$WIKI_DIR"

