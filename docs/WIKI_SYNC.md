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
# Sync
node scripts/wiki/sync-docs-to-wiki.js

# Dry run to preview changes
node scripts/wiki/sync-docs-to-wiki.js --dry-run
```

The dry run clones the wiki and writes the processed pages into `.wiki-temp/`,
then prints the `git status` diff against the published wiki without committing
or pushing.

## What Gets Synced

`FILE_MAPPINGS` in `scripts/wiki/sync-docs-to-wiki.js` is an explicit
allowlist — it is **not** a glob over `docs/`. Docs that are internal
(operational runbooks, tooling notes) stay out of the wiki, and the published
set tracks the index in [docs/README.md](README.md).

**When you add a doc that belongs on the wiki, add it to `FILE_MAPPINGS` and to
`createSidebar()` in the same PR.** Nothing fails if you forget; the page is
just silently absent from the wiki.

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

**Operations** (top-level pages):

- `docs/DEPLOYMENT.md` → `Deployment.md`
- `docs/LIMITS.md` → `Limits.md`
- `docs/CLEAR_PRODUCTION_DATA.md` → `Clear-Production-Data.md`

**Technical Documentation** (in the `Technical/` folder):

- `docs/AGENT_DESIGN.md` → `Technical/Agent-Design.md`
- `docs/TOOL_SYSTEM.md` → `Technical/Tool-System.md`
- `docs/TOOL_PATTERNS.md` → `Technical/Tool-Patterns.md`
- `docs/GRAPHRAG_INTEGRATION.md` → `Technical/GraphRAG-Integration.md`
- `docs/LIBRARY_ENTITY_PIPELINE.md` → `Technical/Library-Entity-Pipeline.md`
- `docs/FILE_UPLOAD_SYSTEM.md` → `Technical/File-Upload-System.md`
- `docs/FILE_ANALYSIS_SYSTEM.md` → `Technical/File-Analysis-System.md`
- `docs/LARGE_FILE_SUPPORT.md` → `Technical/Large-File-Support.md`
- `docs/COMMUNITY_DETECTION_MEMORY.md` → `Technical/Community-Detection-Memory.md`
- `docs/ENTITY_SEARCH_CACHING.md` → `Technical/Entity-Search-Caching.md`
- `docs/CAMPAIGN_SHARD_FLOW.md` → `Technical/Campaign-Shard-Flow.md`
- `docs/SHARD_APPROVAL_SYSTEM.md` → `Technical/Shard-Approval-System.md`
- `docs/SHARD_UI_COMPONENTS.md` → `Technical/Shard-UI-Components.md`
- `docs/CONTINUITY_CHECKER.md` → `Technical/Continuity-Checker.md`
- `docs/SESSION_RUNSHEET.md` → `Technical/Session-Runsheet.md`
- `docs/PLAYER_RECAP_EMAILS.md` → `Technical/Player-Recap-Emails.md`
- `docs/ASSESSMENT_SYSTEM.md` → `Technical/Assessment-System.md`
- `docs/CHECKLIST_STATUS_SYSTEM.md` → `Technical/Checklist-Status-System.md`
- `docs/AUTHENTICATION_FLOW.md` → `Technical/Authentication-Flow.md`
- `docs/STORAGE_STRATEGY.md` → `Technical/Storage-Strategy.md`
- `docs/DAO_LAYER.md` → `Technical/DAO-Layer.md`
- `docs/EVENT_BUS_ARCHITECTURE.md` → `Technical/Event-Bus-Architecture.md`
- `docs/EVENT_BUS_GUIDE.md` → `Technical/Event-Bus-Guide.md`
- `docs/NOTIFICATION_SYSTEM.md` → `Technical/Notification-System.md`
- `docs/MODEL_CONFIGURATION.md` → `Technical/Model-Configuration.md`
- `docs/database/d1-indexes.md` → `Technical/D1-Indexes.md`

The script also automatically creates/updates:

- `_Sidebar.md` - Navigation sidebar for the wiki
- Processes relative links to work in wiki format
- Copies `docs/images/` to `images/` in the wiki

## Link Processing

The script automatically converts documentation links to wiki-friendly format:

- `[text](docs/FILE.md)` → `[text](Wiki-Page-Name)` (or the mapped page for known files)
- `[text](./Some-Doc.md)` / `[text](Some-Doc.md)` under `docs/` → mapped wiki pages when the source file is in the sync list
- Relative image paths are preserved
- The main title is removed from `Home.md`

### Page names are flat, even inside `Technical/`

GitHub flattens wiki page paths. `Technical/Tool-System.md` is published as the
page `Tool-System`, reachable at `/wiki/Tool-System`; `/wiki/Technical/Tool-System`
returns a 404. The folder only groups the files in the wiki repository.

That matters because the two link syntaxes resolve differently:

- `[[Technical/Tool-System|Tool system]]` — GitHub's wiki resolver strips the
  folder and finds the page. Works. This is what `_Sidebar.md` uses.
- `[text](Technical/Tool-System)` — a plain relative URL the browser resolves
  against the current page. Resolves to `/wiki/Technical/Tool-System` and 404s.

So `buildDocsToWikiLinkMap()` rewrites markdown links to the **flattened** page
name (`Tool-System`, not `Technical/Tool-System`). A consequence: two mapped
docs may not share a basename, even in different folders. The script throws on
such a collision rather than publishing links that point at the wrong page.

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
