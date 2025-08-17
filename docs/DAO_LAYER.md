# DAO Layer Implementation

This document describes the Data Access Object (DAO) layer implementation for the LoreSmith AI application.

## Overview

The DAO layer provides a centralized, type-safe interface for all database operations. It abstracts away the direct SQL queries and provides a clean API for data access.

## Architecture

### Base DAO Class

The `BaseDAOClass` provides common database operations and error handling:

- `queryAll<T>()` - Execute a query and return all results
- `queryFirst<T>()` - Execute a query and return the first result
- `execute()` - Execute a query that doesn't return results (INSERT, UPDATE, DELETE)
- `executeAndGetId()` - Execute a query and return the last inserted ID
- `transaction()` - Execute multiple operations in a transaction

### DAO Classes

#### UserDAO

Handles all user-related database operations:

```typescript
// Store or update a user's OpenAI API key
await userDAO.storeOpenAIKey(username, apiKey);

// Get a user's stored OpenAI API key
const apiKey = await userDAO.getOpenAIKey(username);

// Check if a user has a stored OpenAI API key
const hasKey = await userDAO.hasOpenAIKey(username);

// Get storage usage for a user
const usage = await userDAO.getStorageUsage(username);
```

#### CampaignDAO

Handles all campaign-related database operations:

```typescript
// Create a new campaign
await campaignDAO.createCampaign(id, name, username, description);

// Get all campaigns for a user
const campaigns = await campaignDAO.getCampaignsByUser(username);

// Get a campaign with all its details
const campaign = await campaignDAO.getCampaignWithDetails(campaignId);

// Add context to a campaign
await campaignDAO.addCampaignContext(campaignId, contextType, content);
```

#### FileDAO

Handles all file-related database operations:

```typescript
// Create file metadata
await fileDAO.createFileMetadata(
  id,
  fileKey,
  filename,
  username,
  fileSize,
  contentType
);

// Get file metadata
const metadata = await fileDAO.getFileMetadata(fileKey);

// Get file with all its chunks
const fileWithChunks = await fileDAO.getFileWithChunks(fileKey);

// Insert PDF chunks
await fileDAO.insertPDFChunks(chunks);

// Delete file (database, R2 storage, and vector index)
await fileDAO.deleteFile(fileKey, r2Bucket, vectorizeIndex);
```

### DAO Factory

The `DAOFactory` provides a centralized way to access all DAO instances:

```typescript
// Create factory directly
const daoFactory = createDAOFactory(db);

// Or use the helper function (recommended for route handlers)
const daoFactory = getDAOFactory(env);

// Access specific DAOs
const userDAO = daoFactory.userDAO;
const campaignDAO = daoFactory.campaignDAO;
const fileDAO = daoFactory.fileDAO;

// Or use the generic getter
const userDAO = daoFactory.getDAO("userDAO");
```

**Note**: The `getDAOFactory(env)` helper automatically caches factory instances per database, so multiple calls with the same environment will reuse the same factory instance.

## Migration from Direct SQL

### Before (Direct SQL)

```typescript
// In auth routes
await c.env.DB.prepare(
  `INSERT OR REPLACE INTO user_openai_keys (username, api_key, updated_at) 
   VALUES (?, ?, CURRENT_TIMESTAMP)`
)
  .bind(username, openaiApiKey)
  .run();

const result = await c.env.DB.prepare(
  "SELECT api_key FROM user_openai_keys WHERE username = ?"
)
  .bind(username)
  .first<{ api_key: string }>();
```

### After (DAO Layer)

```typescript
// In auth routes
const daoFactory = createDAOFactory(c.env.DB);
await daoFactory.userDAO.storeOpenAIKey(username, openaiApiKey);

const apiKey = await daoFactory.userDAO.getOpenAIKey(username);
```

## Benefits

### 1. **Type Safety**

- All database operations are strongly typed
- TypeScript provides compile-time checking
- Interfaces define the structure of data

### 2. **Centralized Error Handling**

- Consistent error handling across all database operations
- Detailed error logging with context
- Graceful fallbacks for common errors

### 3. **Code Reusability**

- Common database patterns are abstracted
- DRY principle - no repeated SQL queries
- Easy to maintain and update

### 4. **Testing**

- Easy to mock database operations
- Isolated unit tests for data access logic
- Clear separation of concerns

### 5. **Maintainability**

- SQL queries are centralized and documented
- Easy to refactor database operations
- Clear API for data access

## Enhanced File Operations

### Complete File Deletion

The `FileDAO.deleteFile()` method now handles complete cleanup:

```typescript
// Delete file from database, R2 storage, and vector index
await fileDAO.deleteFile(fileKey, r2Bucket, vectorizeIndex);
```

This method:

1. **Database Cleanup**: Removes file metadata and PDF chunks
2. **R2 Storage**: Deletes the actual file from Cloudflare R2
3. **Vector Index**: Removes embeddings from the vector database for AutoRAG
4. **Error Handling**: Gracefully handles failures in any step

### Usage in Routes

```typescript
// In a route handler
export async function handleDeleteFile(c: ContextWithAuth) {
  const fileKey = c.req.param("fileKey");
  const daoFactory = getDAOFactory(c.env);

  await daoFactory.fileDAO.deleteFile(
    fileKey,
    c.env.FILE_BUCKET,
    c.env.VECTORIZE
  );

  return c.json({ success: true });
}
```

## Usage Examples

### Authentication Service

```typescript
// Before
const result = await db
  .prepare(`SELECT api_key FROM user_openai_keys WHERE username = ?`)
  .bind(username)
  .first();

// After
const daoFactory = createDAOFactory(db);
const apiKey = await daoFactory.userDAO.getOpenAIKey(username);
```

### Campaign Service

```typescript
// Before
const { results: context } = await this.db
  .prepare("SELECT * FROM campaign_context WHERE campaign_id = ?")
  .bind(campaignId)
  .all();

// After
const daoFactory = createDAOFactory(this.db);
const context = await daoFactory.campaignDAO.getCampaignContext(campaignId);
```

### File Service

```typescript
// Before
await this.env.DB.prepare(sql)
  .bind(...params)
  .run();

// After
const daoFactory = createDAOFactory(this.env.DB);
await daoFactory.fileDAO.createFileMetadata(
  id,
  fileKey,
  filename,
  username,
  fileSize,
  contentType
);
```

## Testing

The DAO layer includes comprehensive tests:

```bash
# Run DAO tests
npm test tests/dao/

# Run specific DAO test
npm test tests/dao/user-dao.test.ts
```

## Future Enhancements

### 1. **Query Builder**

- Add a query builder for complex queries
- Support for dynamic WHERE clauses
- Pagination support

### 2. **Caching Layer**

- Add caching for frequently accessed data
- Redis or in-memory caching
- Cache invalidation strategies

### 3. **Connection Pooling**

- Optimize database connections
- Connection pooling for better performance
- Connection health checks

### 4. **Migration Support**

- Database migration utilities
- Schema versioning
- Rollback capabilities

## Best Practices

### 1. **Always Use DAOs**

- Never write direct SQL in service or route layers
- Use the DAO factory to get DAO instances
- Keep SQL queries in the DAO layer only

### 2. **Error Handling**

- Let the DAO layer handle database errors
- Provide meaningful error messages
- Log errors with context

### 3. **Type Safety**

- Use TypeScript interfaces for all data structures
- Avoid `any` types in DAO methods
- Provide proper return types

### 4. **Testing**

- Mock DAO methods in unit tests
- Test DAO methods with real database in integration tests
- Use test fixtures for consistent test data

## Migration Guide

To migrate existing code to use the DAO layer:

1. **Identify SQL Operations**
   - Find all direct database queries
   - Group them by entity (user, campaign, file)

2. **Create DAO Methods**
   - Add methods to appropriate DAO classes
   - Ensure proper typing and error handling

3. **Update Service Layer**
   - Replace direct SQL with DAO calls
   - Use the DAO factory to get DAO instances

4. **Update Tests**
   - Mock DAO methods instead of database
   - Test DAO methods separately
   - Update integration tests

5. **Verify Functionality**
   - Run all tests
   - Test in development environment
   - Verify no regressions
