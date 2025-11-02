# Fix type safety: STAGED_SHARDS API response should match StagedShardGroup interface

## Problem

Currently in `src/app.tsx` (lines 449-455), we have a type safety workaround where the API response from `STAGED_SHARDS` endpoint doesn't match the expected `StagedShardGroup` interface. This forces us to use `unknown` type casting:

```typescript
// Note: The API returns a simplified shard structure, so we use unknown
// and let the hook handle proper transformation
const shards = rawShards.map((shard) => ({
  ...shard,
  campaignId: data.campaignId,
  resourceId: shard.resourceId || "unknown",
})) as unknown as StagedShardGroup[];
```

## Expected Behavior

The `STAGED_SHARDS` API endpoint (in `src/routes/campaign-autorag.ts`) should return data that matches the `StagedShardGroup` interface defined in `src/types/shard.ts`:

```typescript
interface StagedShardGroup {
  key: string;
  sourceRef: ShardSourceRef;
  shards: ShardCandidate[];
  created_at: string;
  campaignRagBasePath: string;
}
```

## Current Behavior

The API endpoint `handleGetStagedShards` in `src/routes/campaign-autorag.ts` does construct and return `StagedShardGroup[]` format (line 86). However, there's a type mismatch when consuming this response in `src/app.tsx` during the UI hints flow, forcing unsafe type casts.

## Root Cause

The issue appears to be:

1. The API response structure may not be fully validated as `StagedShardGroup[]`
2. Client-side code in `app.tsx` makes assumptions about the response structure
3. Type definitions may not fully match the runtime data structure
4. Missing type validation/guards when processing the API response

## Impact

- **Type safety is compromised** - Using `unknown` type cast bypasses TypeScript's type checking
- **Potential runtime errors** - If API response structure changes, there's no compile-time safety
- **Poor developer experience** - No type checking for shard data transformations
- **Technical debt** - Workaround code that should be fixed at the source

## Solution

1. **Verify API response structure** - Ensure `handleGetStagedShards` in `src/routes/campaign-autorag.ts` returns properly typed `StagedShardGroup[]` data
2. **Update type definitions** - Ensure `StagedShardGroup` interface matches the actual API response structure
3. **Remove type casting workaround** - Remove the `unknown` type cast in `src/app.tsx` (lines 449-455)
4. **Add type guards** - If needed, add runtime validation to ensure API responses match expected types
5. **Update client-side handling** - Ensure `app.tsx` properly handles the typed response from the API

## Files Affected

- `src/routes/campaign-autorag.ts` - API endpoint handler (`handleGetStagedShards`)
- `src/app.tsx` - Client-side usage (lines 430-465) - Remove workaround
- `src/types/shard.ts` - Type definitions (verify/update if needed)
- `src/hooks/useGlobalShardManager.ts` - May need updates if type structure changes

## Acceptance Criteria

- [ ] API endpoint returns properly typed `StagedShardGroup[]` data
- [ ] Remove `unknown` type cast from `src/app.tsx`
- [ ] All TypeScript errors resolved without unsafe type casts
- [ ] No runtime errors when processing shard data
- [ ] Type definitions match actual API response structure
- [ ] All tests pass

## Priority

**Medium** - Type safety improvement, reduces technical debt, improves maintainability

## Related

- Part of ongoing type safety improvements (see cleanup plan)
- Related to component refactoring work
