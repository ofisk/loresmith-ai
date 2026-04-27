# LoreSmith AI API Documentation

This document provides a comprehensive reference for the LoreSmith AI REST API.

## Base URL

- **Development**: `http://localhost:8787`
- **Production**: Your deployed worker URL

## Authentication

All API requests (except authentication) require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Authentication Endpoint

#### POST `/api/auth/login`

Authenticate and receive a JWT token.

**Request Body:**

```json
{
  "username": "your-username",
  "adminKey": "admin-secret-key",
  "openaiApiKey": "sk-your-openai-api-key"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "username": "your-username",
    "isAdmin": true
  }
}
```

## Campaign Endpoints

### List Campaigns

**GET** `/api/campaigns`

Get all campaigns for the authenticated user.

**Response:**

```json
[
  {
    "id": "campaign-id",
    "name": "The Dragon's Hoard",
    "description": "A thrilling adventure...",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
]
```

### Create Campaign

**POST** `/api/campaigns`

Create a new campaign.

**Request Body:**

```json
{
  "name": "Campaign Name",
  "description": "Optional description"
}
```

**Response:**

```json
{
  "id": "new-campaign-id",
  "name": "Campaign Name",
  "description": "Optional description",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

### Get Campaign

**GET** `/api/campaigns/:campaignId`

Get a specific campaign.

**Response:**

```json
{
  "id": "campaign-id",
  "name": "Campaign Name",
  "description": "Description",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

### Delete Campaign

**DELETE** `/api/campaigns/:campaignId`

Delete a campaign and all associated resources.

## File Endpoints

### Upload File

**POST** `/api/files/upload-url`

Get a signed URL for direct file upload to R2.

**Request Body:**

```json
{
  "filename": "document.pdf",
  "contentType": "application/pdf",
  "size": 1024000
}
```

**Response:**

```json
{
  "uploadUrl": "https://r2-signed-url...",
  "fileId": "file-id"
}
```

**Next Steps:**

1. Use the `uploadUrl` to upload the file directly to R2 (PUT request)
2. Call `/api/files/:fileId/complete` to notify completion

### Complete Upload

**POST** `/api/files/:fileId/complete`

Notify that file upload is complete and trigger processing.

**Request Body:**

```json
{
  "uploadId": "upload-session-id"
}
```

### List Files

**GET** `/api/files`

Get all files for the authenticated user.

**Query Parameters:**

- `campaignId` (optional): Filter by campaign

**Response:**

```json
[
  {
    "id": "file-id",
    "file_name": "document.pdf",
    "display_name": "Display Name",
    "description": "File description",
    "tags": ["tag1", "tag2"],
    "size": 1024000,
    "uploaded_at": "2025-01-01T00:00:00Z",
    "processing_status": "completed"
  }
]
```

### Get File

**GET** `/api/files/:fileId`

Get file metadata.

**Response:**

```json
{
  "id": "file-id",
  "file_name": "document.pdf",
  "display_name": "Display Name",
  "description": "File description",
  "tags": ["tag1", "tag2"],
  "size": 1024000,
  "uploaded_at": "2025-01-01T00:00:00Z",
  "processing_status": "completed"
}
```

### Update File

**PUT** `/api/files/:fileId`

Update file metadata.

**Request Body:**

```json
{
  "display_name": "New Display Name",
  "description": "New description",
  "tags": ["new-tag"]
}
```

### Delete File

**DELETE** `/api/files/:fileId`

Delete a file.

## Library endpoints

Library files use the `/api/library/...` routes. Entity **discovery** runs once per library file and feeds campaign **copies** of staged shards (see [Library entity pipeline](LIBRARY_ENTITY_PIPELINE.md)).

### List library files

**GET** `/api/library/files`

Returns `{ "files": [ ... ] }`. Each file includes the usual metadata fields plus optional pipeline fields:

- **`ingestion_chunk_stats`**: chunk counts for ingestion (`total`, `completed`, `failed`, `pending`, `processing`), or `null` if not applicable.
- **`library_pipeline_ready`**: whether indexing and library discovery are far enough along for the file to be treated as pipeline-complete.
- **`library_entity_discovery_status`**, **`library_entity_discovery_queue_message`**: present when a `library_entity_discovery` row exists.

### Retry library entity discovery

**POST** `/api/library/retry-entity-pipeline`

Re-run library entity discovery for a file after indexing has completed.

**Request body:**

```json
{
  "fileKey": "username/filename-or-full-key"
}
```

**Success response:**

```json
{
  "success": true,
  "message": "Library entity discovery re-queued"
}
```

Returns **400** if `fileKey` is missing or the file is not finished indexing; **404** if the file is not found; **503** if the library entity schema is not available.

## Campaign Resource Endpoints

### Add Resource to Campaign

**POST** `/api/campaigns/:campaignId/resources`

Add a file resource to a campaign.

**Request Body:**

```json
{
  "resourceId": "file-id",
  "resourceType": "file"
}
```

**Entity staging:** The worker copies **pre-discovered** library entities into the campaign when possible. If library discovery is still running or failed, the resource may be created with `entity_copy_status: "pending_library"` until discovery completes and the copy runs (or fails). Shards appear for approval after entities are staged in the campaign.

### Remove Resource from Campaign

**DELETE** `/api/campaigns/:campaignId/resources/:resourceId`

Remove a resource from a campaign.

## GraphRAG & Context Endpoints

### Context Assembly

**POST** `/api/campaigns/:campaignId/context-assembly`

Assemble comprehensive context for a query.

**Request Body:**

```json
{
  "query": "What should I prepare for next session?",
  "options": {
    "maxEntities": 10,
    "maxNeighborsPerEntity": 5,
    "maxPlanningContextResults": 5,
    "applyRecencyWeighting": true,
    "fromDate": "2025-01-01T00:00:00Z",
    "toDate": "2025-12-31T00:00:00Z"
  }
}
```

**Response:**

```json
{
  "context": {
    "worldKnowledge": {
      "entities": [...],
      "overlaySnapshot": {...},
      "totalEntities": 10,
      "queryTime": 250
    },
    "planningContext": [...],
    "metadata": {
      "graphRAGQueryTime": 250,
      "changelogOverlayTime": 50,
      "planningContextTime": 300,
      "totalAssemblyTime": 600,
      "cached": false
    }
  }
}
```

### Planning Context Search

**POST** `/api/campaigns/:campaignId/planning-context/search`

Search session digests and planning context.

**Request Body:**

```json
{
  "query": "What happened with the Black Dragon?",
  "limit": 10,
  "applyRecencyWeighting": true,
  "fromDate": "2025-01-01T00:00:00Z",
  "toDate": "2025-12-31T00:00:00Z"
}
```

**Response:**

```json
{
  "results": [
    {
      "digestId": "digest-id",
      "relevanceScore": 0.95,
      "content": "Session summary text...",
      "entityContext": [...],
      "timestamp": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### Entity Search

**POST** `/api/campaigns/:campaignId/entities/search`

Semantic search for entities.

**Request Body:**

```json
{
  "query": "dragon lair",
  "limit": 10,
  "entityTypes": ["location", "npc"]
}
```

**Response:**

```json
{
  "entities": [
    {
      "id": "entity-id",
      "name": "Dragon's Lair",
      "type": "location",
      "similarity": 0.92,
      "relationships": [...]
    }
  ]
}
```

## Session Digest Endpoints

### Create Session Digest

**POST** `/api/campaigns/:campaignId/session-digests`

Create a new session digest.

**Request Body:**

```json
{
  "sessionNumber": 5,
  "sessionDate": "2025-01-01",
  "digestData": {
    "summary": "Session summary...",
    "keyEvents": ["event1", "event2"],
    "playerActions": ["action1"],
    "stateChanges": {
      "npcs": ["NPC Name - status: description"],
      "locations": ["Location - status: description"],
      "items": ["Item - status: description"]
    }
  }
}
```

### List Session Digests

**GET** `/api/campaigns/:campaignId/session-digests`

Get all session digests for a campaign.

**Response:**

```json
[
  {
    "id": "digest-id",
    "sessionNumber": 5,
    "sessionDate": "2025-01-01",
    "createdAt": "2025-01-01T00:00:00Z"
  }
]
```

### Get Session Digest

**GET** `/api/campaigns/:campaignId/session-digests/:digestId`

Get a specific session digest.

## Entity Endpoints

### List Entities

**GET** `/api/campaigns/:campaignId/entities`

Get all entities for a campaign.

**Query Parameters:**

- `type` (optional): Filter by entity type
- `limit` (optional): Limit results

**Response:**

```json
{
  "entities": [
    {
      "id": "entity-id",
      "name": "Entity Name",
      "type": "npc",
      "description": "Entity description",
      "relationships": [...]
    }
  ]
}
```

### Retry entity staging (library-backed)

**POST** `/api/campaigns/:campaignId/resource/:resourceId/retry-entity-extraction`

Re-queues **library** entity discovery for the resource’s file and marks the campaign resource as pending copy until discovery completes. Subject to per-user retry limits. Returns **409** if library discovery is already in progress for that file.

### Entity extract HTTP route (removed)

Per-campaign **`POST /api/campaigns/:campaignId/entities/extract`** is **not** available. Extraction is **library-scoped**; use discovery + campaign copy (see [Library entity pipeline](LIBRARY_ENTITY_PIPELINE.md)).

## Telemetry Endpoints (Admin Only)

### Record Satisfaction Rating

**POST** `/api/telemetry/satisfaction`

Record a DM satisfaction rating.

**Request Body:**

```json
{
  "campaignId": "campaign-id",
  "rating": 5,
  "comment": "Excellent session!"
}
```

### Record Context Accuracy

**POST** `/api/telemetry/context-accuracy`

Record context accuracy feedback.

**Request Body:**

```json
{
  "campaignId": "campaign-id",
  "queryId": "query-id",
  "accuracy": 0.95,
  "feedback": "Very accurate"
}
```

### Get Metrics

**GET** `/api/admin/telemetry/metrics`

Get aggregated telemetry metrics (admin only).

**Query Parameters:**

- `metricType`: Type of metric (query_latency, rebuild_duration, etc.)
- `campaignId` (optional): Filter by campaign
- `fromDate` (optional): Start date
- `toDate` (optional): End date
- `aggregation`: aggregated or timeseries

### Get Dashboard

**GET** `/api/admin/telemetry/dashboard`

Get dashboard summary (admin only).

**Response:**

```json
{
  "summary": {
    "queryLatency": {
      "avg": 250,
      "p50": 200,
      "p95": 500,
      "p99": 800
    },
    "rebuildDuration": {...},
    "dmSatisfaction": {...},
    "changelogGrowth": [...]
  },
  "lastUpdated": "2025-01-01T00:00:00Z"
}
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `400 Bad Request`: Invalid request data
- `500 Internal Server Error`: Server error

## Rate Limiting

Currently, no rate limiting is enforced. Future versions may implement rate limiting based on:

- Requests per minute
- File upload size limits
- API key usage quotas

## Examples

### Complete File Upload Flow

```javascript
// 1. Request upload URL
const response = await fetch("/api/files/upload-url", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    filename: "document.pdf",
    contentType: "application/pdf",
    size: file.size,
  }),
});

const { uploadUrl, fileId } = await response.json();

// 2. Upload file directly to R2
await fetch(uploadUrl, {
  method: "PUT",
  body: file,
  headers: {
    "Content-Type": "application/pdf",
  },
});

// 3. Notify completion
await fetch(`/api/files/${fileId}/complete`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ uploadId: "upload-session-id" }),
});
```

### Query Campaign Context

```javascript
const response = await fetch(`/api/campaigns/${campaignId}/context-assembly`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: "What should I prepare for next session?",
    options: {
      maxEntities: 10,
      maxPlanningContextResults: 5,
    },
  }),
});

const { context } = await response.json();
console.log(context);
```

---

For more details on specific endpoints, see the source code in `src/routes/`.
