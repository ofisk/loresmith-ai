# Storage Strategy for LoreSmith AI

## Overview

This document outlines the optimal storage strategy for different types of data in the LoreSmith AI application, leveraging Cloudflare's various storage solutions.

## Storage Types & Use Cases

### 1. D1 (SQLite) - Structured Relational Data

**Best for:**

- Relational data with complex queries
- Data requiring ACID transactions
- Structured data with relationships
- Data that needs to be queried by multiple fields

**Current Usage:**

- ✅ Campaigns and campaign metadata
- ✅ Campaign resources and relationships
- ✅ File chunks for RAG processing
- ✅ File metadata and search indexes
- ✅ Campaign context and character data

**Schema:**

```sql
-- Core tables
campaigns (id, username, name, description, status, metadata, created_at, updated_at)
campaign_resources (id, campaign_id, file_key, file_name, description, tags, status, created_at)
file_chunks (id, file_key, username, chunk_text, chunk_index, embedding_id, metadata, created_at)
file_metadata (file_key, username, file_name, description, tags, file_size, status, created_at)
campaign_context (id, campaign_id, context_type, title, content, metadata, created_at)
campaign_characters (id, campaign_id, character_name, backstory, metadata, created_at, updated_at)
```

### 2. R2 (Object Storage) - File Storage

**Best for:**

- Large files (documents, images, videos)
- Binary data that doesn't need querying
- Static assets
- Data that needs to be served directly to clients

**Current Usage:**

- ✅ Document files (primary storage)
- ✅ File metadata as separate objects
- ✅ Character sheet files
- ✅ Images and other binary assets

**Structure:**

```
uploads/{username}/{filename} - Document files
uploads/{username}/{filename}.metadata - File metadata
```

### 3. Durable Objects - Session State

**Best for:**

- Per-user state that needs to be isolated
- Real-time data (chat sessions, live updates)
- Data that needs to be shared across multiple requests
- Temporary session data

**Current Usage:**

- ✅ UserFileTracker (session-based file tracking)
- ✅ CampaignManager (simplified - could be moved to D1)
- ✅ Chat sessions (if implemented)

### 4. KV (Key-Value) - Fast Lookups

**Best for:**

- Simple key-value lookups
- Session data
- Caching
- Configuration data
- Data that needs global distribution

**Current Usage:**

- ❌ Not currently implemented
- 🔄 Recommended for future additions

## Recommended Optimizations

### 1. Simplify CampaignManager Durable Object

**Current State:**

- CampaignManager uses SQLite storage internally
- Campaigns are also stored in D1 via server.ts
- Duplicate storage creates complexity

**Proposed Solution:**

```typescript
// Remove CampaignManager Durable Object entirely
// Use D1 directly for all campaign operations
// Keep UserFileTracker for session state only
```

### 2. Add KV for Session Management

**Proposed Implementation:**

```typescript
// Add to wrangler.jsonc
"kv_namespaces": [
  {
    "binding": "SESSIONS",
    "id": "your-kv-namespace-id",
    "preview_id": "your-preview-kv-namespace-id"
  }
]

// Usage for session data
await env.SESSIONS.put(`session:${sessionId}`, sessionData, {
  expirationTtl: 3600 // 1 hour
});
```

### 3. Optimize R2 Usage

**Current Issues:**

- Metadata stored as separate objects
- No caching layer

**Proposed Solutions:**

```typescript
// Store metadata in D1 instead of separate R2 objects
// Add caching for frequently accessed files
// Implement file versioning for updates
```

### 4. Implement Caching Strategy

**Proposed Layers:**

1. **KV Cache** - For frequently accessed data
2. **D1** - For persistent structured data
3. **R2** - For file storage
4. **Durable Objects** - For session state only

## Migration Plan

### Phase 1: Simplify Durable Objects

1. Move campaign operations from CampaignManager to D1
2. Keep UserFileTracker for session state
3. Remove CampaignManager Durable Object

### Phase 2: Add KV Storage

1. Add KV namespace configuration
2. Implement session management in KV
3. Add caching layer for frequently accessed data

### Phase 3: Optimize R2 Usage

1. Move metadata from R2 to D1
2. Implement file versioning
3. Add caching for file access

### Phase 4: Performance Optimization

1. Add database indexes for common queries
2. Implement connection pooling
3. Add monitoring and metrics

## Data Flow Architecture

```
Client Request
    ↓
KV (Session Check)
    ↓
D1 (Data Operations)
    ↓
R2 (File Storage)
    ↓
Vectorize (Search/Embeddings)
```

## Cost Optimization

### D1 Usage

- Use prepared statements for repeated queries
- Implement proper indexing
- Batch operations when possible

### R2 Usage

- Compress files before storage
- Implement lifecycle policies for old files
- Use appropriate storage classes

### KV Usage

- Set appropriate TTL for session data
- Use efficient key naming conventions
- Monitor usage patterns

### Durable Objects Usage

- Minimize state storage
- Use appropriate isolation strategies
- Clean up unused objects

## Monitoring & Metrics

### Key Metrics to Track

- D1 query performance and usage
- R2 storage costs and access patterns
- KV hit rates and latency
- Durable Object memory usage

### Alerts to Set Up

- High D1 query latency
- R2 storage approaching limits
- KV namespace usage thresholds
- Durable Object memory limits

## Security Considerations

### Data Isolation

- User data properly isolated by username
- Campaign data scoped to campaign owners
- File access controlled by user permissions

### Access Control

- JWT-based authentication for all operations
- File-level access control in R2
- Database-level row security

### Encryption

- Data encrypted at rest in all storage types
- TLS for data in transit
- Secure key management

## Future Considerations

### Scalability

- Monitor performance as user base grows
- Consider sharding strategies for large datasets
- Plan for multi-region deployment

### Feature Additions

- Real-time collaboration features
- Advanced search capabilities
- File sharing and permissions
- Analytics and reporting

### Integration Opportunities

- Webhook support for external integrations
- API rate limiting and quotas
- Third-party service integrations
