# File Upload and Library System

A comprehensive file upload and library system built with Cloudflare Workers, R2, and Durable Objects. Supports both direct uploads for smaller files and multipart uploads for large files (up to 500MB), with automatic processing and metadata generation.

## Architecture Overview

### Core Components

1. **UploadSessionDO** - Durable Object for managing multipart upload sessions
2. **Direct Upload Handler** - Handles files <100MB directly to R2
3. **Multipart Upload Handler** - Handles files ≥100MB with chunked uploads
4. **LibraryRAGService** - Service for metadata generation and search

### Data Flow

```
User Upload → Direct/Multipart Upload → R2 Storage → RAG Processing → D1 Database
```

## Features

### 1. Hybrid Upload System

- **Direct Uploads**: Files <100MB are uploaded directly to R2 storage
- **Multipart Uploads**: Files ≥100MB are split into 50MB chunks for efficient upload
- **Concurrent Uploads**: Multiple files can be uploaded simultaneously
- **Progress Tracking**: Real-time progress updates for multipart uploads
- **Resume Support**: Upload sessions persist across Worker instances

### 2. Persistent Session Management

- **Durable Objects**: Multipart upload sessions are stored in Durable Objects for persistence
- **Session Tracking**: Each upload has a unique session ID
- **Part Management**: Individual parts are tracked and validated
- **Cleanup**: Sessions are automatically cleaned up after completion

### 3. Metadata Generation

- **Auto-tagging**: Files are automatically tagged based on content
- **Description Generation**: AI-generated descriptions for uploaded files
- **Content Analysis**: Text extraction and analysis for various file types
- **Manual Editing**: Users can edit generated metadata

### 4. Search and Library Management

- **Keyword Search**: Search by filename, description, and tags
- **Semantic Search**: Vector-based search (placeholder implementation)
- **File Operations**: Download, delete, and metadata editing
- **Bulk Operations**: Support for multiple file operations

## API Endpoints

### Upload Endpoints

```
PUT /upload/direct/:tenant/:filename
- Direct upload for files <100MB
- Body: File content
- Returns: { success, key, size, uploadedAt }

GET /upload/status/:tenant/:filename
- Check if a file exists in staging
- Returns: { success, exists, metadata }

POST /upload/start-large
- Start a new multipart upload session
- Body: { filename, fileSize, contentType }
- Returns: { sessionId, uploadId, fileKey, totalParts }

POST /upload/part/:sessionId/:partNumber
- Upload a file part
- Body: FormData with file
- Returns: { partNumber, etag, size }

POST /upload/complete-large/:sessionId
- Complete the multipart upload
- Returns: { fileKey, metadata }

GET /upload/progress/:sessionId
- Get upload progress
- Returns: { progress }

DELETE /upload/abort-large/:sessionId
- Abort and clean up upload session
```

### Library Endpoints

```
GET /library/files
- Get user's files
- Query params: limit, offset

GET /library/search
- Search files
- Query params: q, limit, offset, includeTags, includeSemantic

GET /library/files/:fileId
- Get file metadata

PUT /library/files/:fileId
- Update file metadata
- Body: { description, tags }

DELETE /library/files/:fileId
- Delete file

GET /library/files/:fileId/download
- Get download URL

POST /library/files/:fileId/regenerate
- Regenerate metadata
```

## Database Schema

### file_metadata Table

```sql
CREATE TABLE file_metadata (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  vector_id TEXT
);
```

## Configuration

### Wrangler Configuration

```json
{
  "durable_objects": {
    "bindings": [{ "name": "UploadSession", "class_name": "UploadSessionDO" }]
  },
  "r2_buckets": [
    {
      "binding": "R2",
      "bucket_name": "loresmith-files"
    }
  ]
}
```

## Usage Examples

### Direct Upload (Small Files)

```typescript
// For files <100MB
const response = await fetch("/upload/direct/username/filename.pdf", {
  method: "PUT",
  headers: { Authorization: `Bearer ${jwt}` },
  body: fileBlob,
});
```

### Multipart Upload (Large Files)

```typescript
// For files ≥100MB
// 1. Start upload session
const session = await fetch("/upload/start-large", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    filename: "large-file.pdf",
    fileSize: 200000000,
    contentType: "application/pdf",
  }),
});

// 2. Upload parts
const parts = [];
for (let i = 0; i < totalParts; i++) {
  const partResponse = await fetch(`/upload/part/${sessionId}/${i + 1}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  parts.push(await partResponse.json());
}

// 3. Complete upload
const completeResponse = await fetch(`/upload/complete-large/${sessionId}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}` },
});
```

## Security Features

- **JWT Authentication**: All upload endpoints require valid JWT tokens
- **User Isolation**: Users can only access their own files
- **Tenant Validation**: Upload paths are validated against authenticated user
- **Session Management**: Secure session handling for multipart uploads

## Error Handling

- **Network Resilience**: Automatic retry mechanisms for failed uploads
- **Session Recovery**: Ability to resume interrupted multipart uploads
- **Validation**: Comprehensive input validation and error messages
- **Logging**: Detailed logging for debugging and monitoring
