#!/bin/bash

# Script to create GitHub issues from technical debt templates
# Usage: ./scripts/create-github-issues.sh
# Requires: GitHub CLI (gh) and authentication

set -e

REPO=$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')

if [ -z "$REPO" ]; then
    echo "Error: Could not determine GitHub repository"
    exit 1
fi

echo "Repository: $REPO"
echo "This script will create GitHub issues for technical debt items."
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

# Issue 1: Character Sheets Integration
gh issue create \
  --title "Refactor character sheets to use generic file-based campaign context" \
  --body "$(cat <<'EOF'
## Overview
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
See \`src/shared-config.ts:131\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,refactoring,technical-debt" || echo "Failed to create issue 1"

# Issue 2: Multi-Campaign File Deletion
gh issue create \
  --title "Support file deletion from multiple campaign RAG instances" \
  --body "$(cat <<'EOF'
## Overview
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
See \`src/dao/file-dao.ts:431\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,bug,technical-debt" || echo "Failed to create issue 2"

# Issue 3: Remove Redundant File Search
gh issue create \
  --title "Remove redundant file-based search once AutoRAG indexing is reliable" \
  --body "$(cat <<'EOF'
## Overview
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
See \`src/lib/ai-search-utils.ts:169\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,performance,technical-debt" || echo "Failed to create issue 3"

# Issue 4: Support Additional File Types
gh issue create \
  --title "Add support for file types beyond PDF" \
  --body "$(cat <<'EOF'
## Overview
Currently only PDFs are supported. We should add support for other common file types used in tabletop RPG campaigns.

## Implementation Steps
1. Update \`ALLOWED_FILE_TYPES\` array with MIME types:
   - \`application/msword\` (Word documents)
   - \`application/vnd.openxmlformats-officedocument.wordprocessingml.document\` (Word .docx)
   - \`text/plain\` (Plain text files)
   - \`text/markdown\` (Markdown files)
   - \`image/png\`, \`image/jpeg\` (Images with OCR)
2. Add extraction logic in \`file-analysis-service.ts\` for each type
3. Update frontend file picker to accept new types
4. Add tests for each file type
5. Update documentation

## Considerations
- Text extraction methods vary by file type
- OCR may be needed for images
- File size limits may need adjustment
- Storage costs may increase

## Reference
See \`src/app-constants.ts:25\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,feature,technical-debt" || echo "Failed to create issue 4"

# Issue 5: Proper Pagination Total Count
gh issue create \
  --title "Implement proper total count for library pagination" \
  --body "$(cat <<'EOF'
## Overview
Currently using \`files.length\` as total count, which is incorrect for paginated results. We should query the database for the actual total count separately.

## Current Behavior
- Pagination total count uses returned files array length
- This only reflects the current page, not total available files

## Proposed Solution
1. Add a separate database query for total count
2. Use \`COUNT(*)\` query with same filters as main query
3. Return both paginated results and total count
4. Update frontend to use correct total for pagination UI

## Implementation
\`\`\`typescript
// Example query
const totalCount = await db
  .prepare("SELECT COUNT(*) as total FROM file_metadata WHERE ...")
  .first();
\`\`\`

## Reference
See \`src/routes/library.ts:46\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,bug,technical-debt" || echo "Failed to create issue 5"

# Issue 6: Tune File Recommendation Parameters
gh issue create \
  --title "Tune file recommendation parameters based on user feedback" \
  --body "$(cat <<'EOF'
## Overview
File recommendation parameters may need tuning based on user feedback and usage patterns.

## Proposed Enhancements
1. Add \`minRelevanceScore\` parameter to filter low-confidence recommendations
2. Add \`maxResults\` parameter to limit recommendation count
3. Add \`includeMetadata\` option to control metadata inclusion
4. Collect user feedback on recommendation quality
5. A/B test different parameter values

## Metrics to Track
- Click-through rate on recommendations
- User satisfaction ratings
- Relevance score distributions
- Usage patterns by campaign type

## Reference
See \`src/tools/general/file-recommendation-tools.ts:37\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,analytics,technical-debt" || echo "Failed to create issue 6"

# Issue 7: AI-Assisted Campaign Resolution
gh issue create \
  --title "Use AI to resolve ambiguous campaign references" \
  --body "$(cat <<'EOF'
## Overview
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
See \`src/tools/campaign/core-tools.ts:406\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,feature,technical-debt" || echo "Failed to create issue 7"

# Issue 8: Implement Semantic Search
gh issue create \
  --title "Implement semantic search using vector embeddings" \
  --body "$(cat <<'EOF'
## Overview
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
See \`src/services/rag-service.ts:361\` for the original NOTE comment.
EOF
)" \
  --label "enhancement,feature,performance,technical-debt" || echo "Failed to create issue 8"

# Issue 9: Authentication Flow Review
gh issue create \
  --title "Review and document authentication flow after testing" \
  --body "$(cat <<'EOF'
## Overview
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
See \`src/routes/auth.ts:326,348\` for the original NOTE comments.
EOF
)" \
  --label "documentation,technical-debt,review" || echo "Failed to create issue 9"

echo ""
echo "Done! Created GitHub issues for technical debt items."
echo "Check your repository at: https://github.com/$REPO/issues"

