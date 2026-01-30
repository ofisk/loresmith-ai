# Tool patterns

## ToolContext

Tool execute functions receive an optional **context** object. Use the **ToolContext** type (`src/tools/utils.ts`): `{ env?: unknown; toolCallId?: string }`. Prefer `context?: ToolContext` over `context?: any` in signatures. `context.env` is set when running inside a Durable Object/Worker; `context.toolCallId` is set by the runtime for correlating results.

## Env vs API fallback

Tools run in two environments:

1. **Inside a Durable Object** (normal chat): `context.env` is set. Tools use `getDAOFactory(env)` and hit the database (and other bindings) directly.
2. **Outside the DO** (e.g. tests, or if context is missing): `context.env` is null. Tools call the HTTP API with `authenticatedFetch` and the user’s JWT.

Shared helpers:

- **getEnvFromContext** (`src/tools/utils.ts`): Returns `context.env` or `globalThis.env` if present, otherwise `null`. Use this to decide “DB path” vs “API path”.
- **runWithEnvOrApi** (`src/tools/utils.ts`): Runs either `apiCall()` (when no env) or `dbCall(env, userId)` (when env and valid JWT). Pass `authErrorResult` for the “invalid JWT” case. Reduces boilerplate for tools that support both paths.

Pattern in tool `execute` (without helper):

```ts
const env = getEnvFromContext(context);
if (!env) {
  // API path: authenticatedFetch(...), then createToolError / createToolSuccess
  return ...;
}
// DB path: getDAOFactory(env), validate user/campaign, run DAO calls, return createToolSuccess/Error
```

## Error and success responses

- **createToolError** / **createToolSuccess** (`src/tools/utils.ts`): Standard shape for tool results (toolCallId, success, message, data). Optional campaign name is used for user-facing messages.
- **toolCallId**: Taken from `context?.toolCallId ?? "unknown"` so the runtime can correlate results with invocations.

## Common flow

1. Get `toolCallId` from context.
2. Get `env` via `getEnvFromContext(context)`.
3. If no env, call API with JWT, handle errors, return `createToolError` or `createToolSuccess`.
4. If env, extract user (e.g. `extractUsernameFromJwt(jwt)`), validate campaign (e.g. `getCampaignByIdWithMapping`), then run DAO/service logic and return `createToolError` or `createToolSuccess`.
5. Wrap in try/catch; on throw, return `createToolError` with the caught error.

## Pagination and token limits

- **listAllEntities** and similar tools return one page at a time (e.g. `page`, `pageSize`). The tool description tells the agent to call again with the next page when `totalPages > 1`.
- **searchCampaignContext** uses `limit` and `offset`; tool results may be trimmed by `trimToolResultsByRelevancy` in the agent when the combined context would exceed token limits.
- Prefer pagination and “one page per call” over returning unbounded lists so the agent stays within context limits.

## Shared utilities

- **commonSchemas** (e.g. `campaignId`, `jwt`) in `src/tools/utils.ts` for consistent parameter schemas.
- **getCampaignName**: Optional enrichment for error/success messages.
- **extractUsernameFromJwt**, **createAuthHeaders**: Used by both DB and API paths for auth and API calls.

See also: [AGENT_DESIGN.md](./AGENT_DESIGN.md) (how agents invoke tools and handle token limits), [GRAPHRAG_INTEGRATION.md](./GRAPHRAG_INTEGRATION.md) (search and context assembly).
