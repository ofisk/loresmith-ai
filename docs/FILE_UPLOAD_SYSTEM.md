# File Upload and Library System

A comprehensive file upload and library system built with Cloudflare Workers, R2, and Durable Objects. Supports large file uploads, concurrent uploads, metadata generation, and search functionality.

## Architecture Overview

### Core Components

1. **UploadSessionDO** - Durable Object for managing upload sessions
2. **UploadService** - Service for handling multipart uploads to R2
3. **LibraryRAGService** - Service for metadata generation and search

### Data Flow

```
User Upload → UploadSessionDO → R2 Storage → RAG Processing → D1 Database
```

## Features

### 1. Large File Support

- **Multipart Uploads**: Files are split into 5MB chunks for efficient upload
- **Concurrent Uploads**: Multiple files can be uploaded simultaneously
- **Progress Tracking**: Real-time progress updates for each upload
- **Resume Support**: Upload sessions persist across Worker instances

### 2. Persistent Session Management

- **Durable Objects**: Upload sessions are stored in Durable Objects for persistence
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
POST /upload/start
- Start a new upload session
- Body: { filename, fileSize, contentType }
- Returns: { sessionId, uploadId, fileKey, totalParts }

POST /upload/part
- Upload a file part
- Body: FormData with sessionId, partNumber, file
- Returns: { partNumber, etag, size }

POST /upload/complete
- Complete the multipart upload
- Body: { sessionId }
- Returns: { fileKey, metadata }

GET /upload/progress/:sessionId
- Get upload progress
- Returns: { progress }

DELETE /upload/session/:sessionId
- Clean up upload session
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
      "binding": "FILE_BUCKET",
      "bucket_name": "loresmith-files"
    }
  ]
}
```

## Usage Examples

### Upload a File

```typescript
import { FileUpload } from './components/file-upload/FileUpload';

<FileUpload
  onUploadComplete={(fileKey, metadata) => {
    console.log('Upload completed:', fileKey, metadata);
  }}
  onUploadError={(error) => {
    console.error('Upload failed:', error);
  }}
  maxFileSize={100 * 1024 * 1024} // 100MB
  allowedTypes={['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']}
  multiple={true}
/>
```

### Browse Library

```typescript
import { FileLibrary } from './components/library/FileLibrary';

<FileLibrary
  onFileSelect={(file) => {
    console.log('File selected:', file);
  }}
  onFileDelete={(fileId) => {
    console.log('File deleted:', fileId);
  }}
/>
```

## Development Notes

### TODO Items

1. **Document Text Extraction**: Implement actual document parsing
2. **Vector Embeddings**: Add real embedding generation and storage
3. **Semantic Search**: Implement vector-based search
4. **File Type Detection**: Add more file type support
5. **Thumbnail Generation**: Add preview generation for images
6. **Upload Resume**: Add support for resuming failed uploads

### Performance Considerations

- **Chunk Size**: 5MB chunks balance memory usage and upload speed
- **Concurrency**: Limited to prevent overwhelming the Worker
- **Session Cleanup**: Automatic cleanup prevents memory leaks
- **Database Indexes**: Optimized for common query patterns

### Security Features

- **User Isolation**: Files are isolated by user ID
- **Authentication**: All endpoints require valid JWT
- **File Validation**: File type and size validation
- **Access Control**: Users can only access their own files

## Migration from Old System

The new system is designed to be backward compatible with the existing document upload system. The old document routes are preserved while new general-purpose upload routes are added.

### Key Differences

1. **Session Management**: New system uses Durable Objects instead of client-side state
2. **Concurrent Uploads**: Support for multiple simultaneous uploads
3. **Metadata Generation**: Automatic tagging and description generation
4. **Search Capabilities**: Full-text search across all file metadata

## Deployment

1. **Database Migration**: Run the new migration to create file_metadata table
2. **Durable Object**: Deploy the UploadSessionDO Durable Object
3. **R2 Bucket**: Create the new FILE_BUCKET for general file storage
4. **Frontend**: Deploy the new React components

The system is designed to be deployed incrementally without breaking existing functionality.
