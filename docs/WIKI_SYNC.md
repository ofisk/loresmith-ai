# Syncing Documentation to GitHub Wiki

This guide explains how to programmatically sync documentation from the `docs/` directory to the GitHub Wiki.

## Overview

GitHub wikis are actually Git repositories that can be cloned, edited, and pushed to just like regular repositories. Each repository's wiki can be accessed at:

```
https://github.com/OWNER/REPO.wiki.git
```

The wiki sync scripts automate the process of:

1. Cloning the wiki repository
2. Copying documentation files from `docs/` to appropriate wiki pages
3. Processing markdown links to work in wiki format
4. Committing and pushing changes

## Prerequisites

1. **Wiki must be enabled**: The wiki feature must be enabled on your GitHub repository
   - Go to `https://github.com/OWNER/REPO/settings`
   - Scroll to "Features" section
   - Enable "Wikis"

2. **Git authentication**: You must have push access to the repository
   - Configure git credentials for GitHub
   - Or use a GitHub Personal Access Token with `repo` scope

## Usage

### Quick Start

```bash
# Sync all documentation to wiki (recommended)
npm run wiki:sync

# Preview changes without committing (dry run)
npm run wiki:sync:dry-run
```

### Manual Execution

```bash
# Using the Node.js script (cross-platform)
node scripts/sync-docs-to-wiki.js

# Using the bash script (Unix/macOS/Linux)
./scripts/sync-docs-to-wiki.sh

# Dry run to preview changes
node scripts/sync-docs-to-wiki.js --dry-run
```

## What Gets Synced

The script automatically maps documentation files to wiki pages:

| Source File             | Wiki Page            |
| ----------------------- | -------------------- |
| `README.md`             | `Home.md`            |
| `docs/USER_GUIDE.md`    | `User-Guide.md`      |
| `docs/FEATURES.md`      | `Features.md`        |
| `docs/ARCHITECTURE.md`  | `Architecture.md`    |
| `docs/API.md`           | `API-Reference.md`   |
| `docs/DEV_SETUP.md`     | `Developer-Setup.md` |
| `docs/TESTING_GUIDE.md` | `Testing-Guide.md`   |
| `docs/CONTRIBUTING.md`  | `Contributing.md`    |

**Technical Documentation** (in `Technical/` folder):

- `docs/GRAPHRAG_INTEGRATION.md` → `Technical/GraphRAG-Integration.md`
- `docs/AUTHENTICATION_FLOW.md` → `Technical/Authentication-Flow.md`
- `docs/STORAGE_STRATEGY.md` → `Technical/Storage-Strategy.md`
- `docs/FILE_ANALYSIS_SYSTEM.md` → `Technical/File-Analysis-System.md`
- `docs/MODEL_CONFIGURATION.md` → `Technical/Model-Configuration.md`

The script also automatically creates/updates:

- `_Sidebar.md` - Navigation sidebar for the wiki
- Processes relative links to work in wiki format

## Link Processing

The script automatically converts documentation links to wiki-friendly format:

- `[text](docs/FILE.md)` → `[text](Wiki-Page-Name)`
- Relative image paths are preserved
- The main title is removed from `Home.md`

## Troubleshooting

### "Failed to clone wiki repository"

**Solution**: Enable the wiki feature on GitHub:

1. Go to repository Settings
2. Scroll to "Features" section
3. Enable "Wikis"
4. Try running the script again

### "Failed to push to wiki repository"

**Solutions**:

1. **Check git authentication**:

   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your.email@example.com"
   ```

2. **Use GitHub Personal Access Token**:
   - Create a token at https://github.com/settings/tokens
   - Use it in the clone URL:
     ```bash
     git clone https://TOKEN@github.com/OWNER/REPO.wiki.git
     ```

3. **Check repository permissions**: Ensure you have write access to the repository

### "No changes to commit"

This is normal! It means the wiki is already up to date with your documentation files.

## Automation

You can integrate wiki syncing into your workflow:

### GitHub Actions

```yaml
name: Sync Wiki

on:
  push:
    branches: [main]
    paths:
      - "docs/**"
      - "README.md"

jobs:
  sync-wiki:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - name: Sync to Wiki
        run: npm run wiki:sync
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
npm run wiki:sync
```

## How It Works

1. **Clone**: The script clones the wiki repository to a temporary directory (`.wiki-temp`)
2. **Copy**: Documentation files are copied and processed for wiki format
3. **Commit**: Changes are committed with a descriptive message
4. **Push**: Changes are pushed to the wiki repository
5. **Cleanup**: Temporary directory is removed

The wiki repository uses the same branch structure as regular repos (typically `main` or `master`).

## References

- [GitHub: Adding and Editing Wiki Pages Locally](https://docs.github.com/articles/adding-and-editing-wiki-pages-locally)
- [GitHub API Documentation](https://docs.github.com/en/rest)
