<!-- 64193f19-54d0-44e4-bfcf-9e6af195db54 f27f0296-3e1f-41c1-a7c4-28311e45b9aa -->

# Implement Filename-based Subdirectory Isolation for AutoRAG

## Problem

Cloudflare's AutoRAG filters are unreliable for precise file-level filtering using exact path matches. The only reliable filter pattern is "starts with" using compound gt/lte filters on the `folder` attribute.

## Solution

Store each file in its own subdirectory named after the file: `library/username/filename/filename.pdf`. This allows using "starts with" filters like `library/username/filename/` to guarantee only that specific file's content is retrieved.

## Implementation Steps

### 1. Update File Key Construction Utilities

**File: `src/utils/file-keys.ts`**

Update `buildLibraryFileKey` to use filename-based subdirectories:

```typescript
// OLD: library/username/filename.pdf
// NEW: library/username/filename.pdf/filename.pdf
export function buildLibraryFileKey(
  tenant: string,
  filename: string,
  autoragPrefix: string
): string {
  // Use filename as subdirectory for isolation
  return `${LIBRARY_CONFIG.getBasePath()}/${tenant}/${filename}/${filename}`;
}
```

### 2. Update AutoRAG Filter Logic

**File: `src/lib/ai-search-utils.ts`**

Replace the simple `eq` filter with compound "starts with" filter pattern:

```typescript
// Around line 176-184 in executeAISearchWithRetry
const basicSearchResult = await libraryAutoRAG.aiSearch("test search", {
  max_results: 10,
  rewrite_query: false,
  filters: {
    type: "and",
    filters: [
      {
        type: "gt",
        key: "folder",
        value: `${fullPathForFilter}//`,
      },
      {
        type: "lte",
        key: "folder",
        value: `${fullPathForFilter}/z`,
      },
    ],
  },
});
```

And around line 223-230 for the main AI search:

```typescript
const res = await libraryAutoRAG.aiSearch(structuredExtractionPrompt, {
  max_results: 50,
  rewrite_query: false,
  filters: {
    type: "and",
    filters: [
      {
        type: "gt",
        key: "folder",
        value: `${fullPathForFilter}//`,
      },
      {
        type: "lte",
        key: "folder",
        value: `${fullPathForFilter}/z`,
      },
    ],
  },
});
```

Update path construction logic (around line 152-156):

```typescript
// Files are stored as: library/username/filename/filename.pdf
// AutoRAG searches should use: library/username/filename/
const fullPathForFilter = resourceFileName.startsWith("library/")
  ? resourceFileName.replace(/\/[^/]+$/, "") // Remove trailing filename to get folder
  : `library/${resourceFileName.replace(/\/[^/]+$/, "")}`;
```

### 3. Update AutoRAG Client Base Class

**File: `src/services/autorag-client.ts`**

Update the `aiSearch` method to use compound filters for "starts with" behavior when a specific file path is provided (around line 154-158):

```typescript
if (specificPath.startsWith(enforcedPath)) {
  console.log(
    "[AutoRAGClientBase] Specific file path is within user's library folder, using starts-with filter"
  );
  // Use compound "starts with" filter for the specific file folder
  mergedOptions.filters = {
    type: "and",
    filters: [
      {
        type: "gt",
        key: "folder",
        value: `${specificPath}//`,
      },
      {
        type: "lte",
        key: "folder",
        value: `${specificPath}/z`,
      },
    ],
  };
}
```

### 4. Update Shard Generation Path Logic

**File: `src/lib/shard-generation-utils.ts`**

Update `getAutoRAGSearchPath` to return folder path instead of full file path:

```typescript
export function getAutoRAGSearchPath(resource: NormalizedResource): string {
  // Extract folder path from file_key
  // e.g., "library/username/file.pdf/file.pdf" -> "library/username/file.pdf/"
  const fileKey = resource.fileKey || resource.file_key;
  const lastSlashIndex = fileKey.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return fileKey;
  }
  // Return the folder path (everything up to but not including the last filename)
  return fileKey.substring(0, lastSlashIndex + 1);
}
```

### 5. Update Comments and Documentation

Update inline comments throughout to reflect new structure:

- `src/utils/file-keys.ts` - Update function documentation
- `src/lib/ai-search-utils.ts` - Update path construction comments
- `src/app-constants.ts` - Update LIBRARY_CONFIG comments if needed

### 6. Testing Strategy

After implementation:

1. Upload a new file - verify it's stored at `library/username/filename/filename.pdf`
2. Add file to campaign - verify AutoRAG search uses compound filter
3. Generate shards - verify only content from that specific file is returned
4. Upload file with same name - verify it overwrites (matches current behavior)
5. Check logs for filter construction and AutoRAG response

## Migration Notes

**Existing Files**: Old files at `library/username/filename.pdf` will remain. They will not be found by new filter logic, but this is acceptable since:

- Production data was recently wiped
- New uploads will use correct structure
- Old files can be re-uploaded if needed

**No Database Changes Required**: The `file_metadata` table already stores `file_key`, which will now contain the new path format.

### To-dos

- [ ] Update buildLibraryFileKey in file-keys.ts to use filename subdirectories
- [ ] Replace eq filters with compound gt/lte filters in ai-search-utils.ts
- [ ] Update AutoRAGClientBase to use compound filters for specific file paths
- [ ] Update getAutoRAGSearchPath to return folder path instead of file path
- [ ] Update inline comments to reflect new directory structure
- [ ] Test file upload, shard generation, and filter behavior
