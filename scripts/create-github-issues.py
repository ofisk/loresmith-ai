#!/usr/bin/env python3
"""
Create GitHub issues from technical debt templates using GitHub API.

Usage:
    python3 scripts/create-github-issues.py

Requires:
    - GITHUB_TOKEN environment variable set with a GitHub personal access token
    - Token needs 'repo' scope

To create a token:
    1. Go to https://github.com/settings/tokens
    2. Click "Generate new token (classic)"
    3. Select 'repo' scope
    4. Copy the token and set: export GITHUB_TOKEN="your_token_here"
"""

import os
import sys
import json
import subprocess
import re
from typing import Dict, List

def get_repo_info() -> str:
    """Get repository owner/name from git remote."""
    try:
        result = subprocess.run(
            ["git", "config", "--get", "remote.origin.url"],
            capture_output=True,
            text=True,
            check=True
        )
        url = result.stdout.strip()
        # Handle both git@github.com:owner/repo.git and https://github.com/owner/repo.git
        match = re.search(r"github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$", url)
        if match:
            return f"{match.group(1)}/{match.group(2)}"
        raise ValueError(f"Could not parse repository URL: {url}")
    except subprocess.CalledProcessError:
        raise ValueError("Could not determine repository. Make sure you're in a git repository.")

def create_issue(owner: str, repo: str, token: str, title: str, body: str, labels: List[str]) -> Dict:
    """Create a GitHub issue using the API."""
    import urllib.request
    import urllib.error
    
    url = f"https://api.github.com/repos/{owner}/{repo}/issues"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }
    
    data = {
        "title": title,
        "body": body,
        "labels": labels
    }
    
    req = urllib.request.Request(url, headers=headers, data=json.dumps(data).encode())
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        raise Exception(f"Failed to create issue '{title}': {e.code} - {error_body}")

def main():
    # Check for token
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("Error: GITHUB_TOKEN environment variable not set")
        print("\nTo create a token:")
        print("1. Go to https://github.com/settings/tokens")
        print("2. Click 'Generate new token (classic)'")
        print("3. Select 'repo' scope")
        print("4. Copy the token and run: export GITHUB_TOKEN='your_token_here'")
        print("5. Then run this script again")
        sys.exit(1)
    
    # Get repository info
    try:
        repo_full = get_repo_info()
        owner, repo = repo_full.split("/")
        print(f"Repository: {repo_full}")
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    # Issues to create
    issues = [
        {
            "title": "Refactor character sheets to use generic file-based campaign context",
            "body": """## Overview
Character sheets are currently handled as a separate entity type with dedicated API endpoints. This adds complexity to the codebase.

## Proposed Solution
Treat character sheets as regular files and add them to campaign context generically. This would simplify the API and reduce code duplication.

## Implementation Steps
1. Migrate existing character sheet data to the generic file structure
2. Update the UI to handle character sheets as regular campaign resources
3. Remove character sheet-specific endpoints and logic
4. Update documentation

## Benefits
- Reduced code complexity
- Consistent handling of all campaign resources
- Easier maintenance and extension

## Reference
See `src/shared-config.ts:131` for the original NOTE comment.""",
            "labels": ["enhancement", "refactoring", "technical-debt"]
        },
        {
            "title": "Support file deletion from multiple campaign RAG instances",
            "body": """## Overview
Currently, when a file is deleted, it's only removed from the global RAG index. When files can be associated with multiple campaigns (each with their own RAG instance), we need to delete the file from all associated campaign RAGs.

## Current Behavior
- File deletion removes from global RAG index only
- Campaign-specific RAG instances may retain stale references

## Proposed Solution
1. Track campaign-file associations in the database
2. When deleting a file, query all associated campaigns
3. Delete the file from each campaign's RAG instance
4. Handle edge cases (orphaned references, partial failures)

## Implementation Requirements
- Database schema for campaign-file associations
- Query logic to find all campaigns using a file
- Batch deletion from multiple RAG instances
- Error handling and rollback logic

## Reference
See `src/dao/file-dao.ts:431` for the original NOTE comment.""",
            "labels": ["enhancement", "bug", "technical-debt"]
        },
        {
            "title": "Remove redundant file-based search once AutoRAG indexing is reliable",
            "body": """## Overview
Currently, the system performs both file-based and AutoRAG-based searches. Once file upload and AutoRAG indexing are fully reliable, we can remove the redundant file-based search.

## Current Behavior
- Dual search mechanism (file-based + AutoRAG)
- Adds complexity and potential inconsistency

## Proposed Solution
1. Monitor AutoRAG indexing reliability metrics
2. Once reliability threshold is met, remove file-based search
3. Update error handling to rely solely on AutoRAG
4. Remove deprecated search code paths

## Prerequisites
- AutoRAG indexing reliability > 99%
- Comprehensive error handling for AutoRAG failures
- Fallback mechanisms if needed

## Reference
See `src/lib/ai-search-utils.ts:169` for the original NOTE comment.""",
            "labels": ["enhancement", "performance", "technical-debt"]
        },
        {
            "title": "Add support for file types beyond PDF",
            "body": """## Overview
Currently only PDFs are supported. We should add support for other common file types used in tabletop RPG campaigns.

## Implementation Steps
1. Update `ALLOWED_FILE_TYPES` array with MIME types:
   - `application/msword` (Word documents)
   - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (Word .docx)
   - `text/plain` (Plain text files)
   - `text/markdown` (Markdown files)
   - `image/png`, `image/jpeg` (Images with OCR)
2. Add extraction logic in `file-analysis-service.ts` for each type
3. Update frontend file picker to accept new types
4. Add tests for each file type
5. Update documentation

## Considerations
- Text extraction methods vary by file type
- OCR may be needed for images
- File size limits may need adjustment
- Storage costs may increase

## Reference
See `src/app-constants.ts:25` for the original NOTE comment.""",
            "labels": ["enhancement", "feature", "technical-debt"]
        },
        {
            "title": "Implement proper total count for library pagination",
            "body": """## Overview
Currently using `files.length` as total count, which is incorrect for paginated results. We should query the database for the actual total count separately.

## Current Behavior
- Pagination total count uses returned files array length
- This only reflects the current page, not total available files

## Proposed Solution
1. Add a separate database query for total count
2. Use `COUNT(*)` query with same filters as main query
3. Return both paginated results and total count
4. Update frontend to use correct total for pagination UI

## Implementation
```typescript
// Example query
const totalCount = await db
  .prepare("SELECT COUNT(*) as total FROM file_metadata WHERE ...")
  .first();
```

## Reference
See `src/routes/library.ts:46` for the original NOTE comment.""",
            "labels": ["enhancement", "bug", "technical-debt"]
        },
        {
            "title": "Tune file recommendation parameters based on user feedback",
            "body": """## Overview
File recommendation parameters may need tuning based on user feedback and usage patterns.

## Proposed Enhancements
1. Add `minRelevanceScore` parameter to filter low-confidence recommendations
2. Add `maxResults` parameter to limit recommendation count
3. Add `includeMetadata` option to control metadata inclusion
4. Collect user feedback on recommendation quality
5. A/B test different parameter values

## Metrics to Track
- Click-through rate on recommendations
- User satisfaction ratings
- Relevance score distributions
- Usage patterns by campaign type

## Reference
See `src/tools/general/file-recommendation-tools.ts:37` for the original NOTE comment.""",
            "labels": ["enhancement", "analytics", "technical-debt"]
        },
        {
            "title": "Use AI to resolve ambiguous campaign references",
            "body": """## Overview
Currently uses exact name/ID matching for campaign resolution. Users with multiple campaigns may use ambiguous references like "my D&D campaign" which won't match.

## Proposed Solution
Implement AI-assisted resolution that can:
1. Understand context from conversation history
2. Infer campaign from user's recent activity
3. Use fuzzy matching for partial names
4. Suggest disambiguation when multiple matches found

## Implementation Approach
1. Analyze conversation context for campaign hints
2. Check user's recent campaign activity
3. Use LLM to infer most likely campaign from ambiguous references
4. Fall back to exact matching if inference fails

## Example Use Cases
- "my D&D campaign" → resolves to most recently accessed D&D campaign
- "the Barovia one" → resolves to campaign containing "Barovia"
- "campaign from last week" → resolves using timestamp analysis

## Reference
See `src/tools/campaign/core-tools.ts:406` for the original NOTE comment.""",
            "labels": ["enhancement", "feature", "technical-debt"]
        },
        {
            "title": "Implement semantic search using vector embeddings",
            "body": """## Overview
Currently uses keyword-based search. Semantic search using vector embeddings would provide better relevance matching, especially for similar content with different wording.

## Current Behavior
- Keyword-based search only
- May miss semantically similar content with different terminology

## Proposed Solution
1. Generate vector embeddings for file content during indexing
2. Store embeddings in vector database (Vectorize)
3. Implement semantic search using cosine similarity
4. Combine keyword and semantic search results
5. Provide relevance scoring

## Implementation Steps
1. Integrate embedding model (OpenAI embeddings or similar)
2. Generate embeddings during file upload/indexing
3. Store in Vectorize index alongside existing metadata
4. Implement hybrid search (keyword + semantic)
5. Tune relevance scoring algorithm
6. Add tests and benchmarks

## Benefits
- Better handling of synonyms and related concepts
- Improved relevance for conceptual queries
- Better multilingual support (if needed)

## Reference
See `src/services/rag-service.ts:361` for the original NOTE comment.""",
            "labels": ["enhancement", "feature", "performance", "technical-debt"]
        },
        {
            "title": "Review and document authentication flow after testing",
            "body": """## Overview
Authentication flow may need review after comprehensive testing to ensure all edge cases are handled correctly.

## Review Checklist
- [ ] Test token expiration handling
- [ ] Test refresh token flow
- [ ] Test concurrent session management
- [ ] Verify error handling for all failure modes
- [ ] Review security best practices
- [ ] Document authentication state machine
- [ ] Update API documentation

## Areas to Verify
- Token storage and retrieval
- Session invalidation
- Error message clarity
- User experience during auth failures

## Reference
See `src/routes/auth.ts:326,348` for the original NOTE comments.""",
            "labels": ["documentation", "technical-debt", "review"]
        }
    ]
    
    print(f"\nThis will create {len(issues)} GitHub issues.")
    # Skip confirmation if running non-interactively (e.g., piped input or CI)
    if sys.stdin.isatty():
        print("Press Ctrl+C to cancel, or Enter to continue...")
        try:
            input()
        except KeyboardInterrupt:
            print("\nCancelled.")
            sys.exit(0)
    else:
        print("Running non-interactively, proceeding automatically...")
    
    created = []
    failed = []
    
    for i, issue in enumerate(issues, 1):
        print(f"\n[{i}/{len(issues)}] Creating issue: {issue['title']}")
        try:
            result = create_issue(owner, repo, token, issue['title'], issue['body'], issue['labels'])
            created.append({
                "number": result.get("number"),
                "title": result.get("title"),
                "url": result.get("html_url")
            })
            print(f"  ✓ Created: #{result.get('number')} - {result.get('html_url')}")
        except Exception as e:
            failed.append({"title": issue['title'], "error": str(e)})
            print(f"  ✗ Failed: {e}")
    
    # Summary
    print("\n" + "="*60)
    print("Summary:")
    print(f"  Created: {len(created)} issues")
    print(f"  Failed: {len(failed)} issues")
    
    if created:
        print("\nCreated issues:")
        for issue in created:
            print(f"  #{issue['number']}: {issue['title']}")
            print(f"    {issue['url']}")
    
    if failed:
        print("\nFailed issues:")
        for issue in failed:
            print(f"  - {issue['title']}")
            print(f"    Error: {issue['error']}")
    
    print(f"\nView all issues: https://github.com/{owner}/{repo}/issues")

if __name__ == "__main__":
    main()

