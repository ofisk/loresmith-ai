# Large File Upload System

This document describes the large file upload system. While multipart uploads can technically handle larger files, the practical processing limit is 100MB due to Cloudflare Workers' 128MB memory limit (with buffer for overhead).

## Overview

The large file upload system provides a hybrid approach:

- **Small files** (<100MB): Use direct uploads for simplicity and security
- **Large files** (≥100MB): Use multipart uploads with server-side part handling

## Architecture

### Components

1. **Multipart Upload**: Files are split into 50MB chunks for efficient upload
2. **Durable Objects**: Upload sessions are managed in Durable Objects for persistence
3. **Server-side Processing**: All parts are uploaded through authenticated API endpoints
4. **Progress Tracking**: Real-time progress updates for each upload session

### Data Flow

```
Client → Start Upload Session → Upload Parts → Complete Upload → Process File
   ↓           ↓                    ↓              ↓              ↓
R2 Multipart  Durable Object    R2 Storage    Database      RAG Processing
```

## API Endpoints

### 1. Start Large File Upload

**POST** `/upload/start-large`

Start a new multipart upload session for large files.

**Request Body:**

```json
{
  "filename": "large-document.pdf",
  "fileSize": 150000000,
  "contentType": "application/pdf"
}
```

**Response:**

```json
{
  "success": true,
  "sessionId": "abc123def456",
  "uploadId": "multipart-upload-id",
  "fileKey": "staging/username/large-document.pdf",
  "totalParts": 3,
  "partSize": 52428800,
  "uploadMethod": "server-side"
}
```

### 2. Upload File Part

**POST** `/upload/part/:sessionId/:partNumber`

Upload a specific part of the file.

**Request Body:** Binary data (ArrayBuffer)

**Response:**

```json
{
  "success": true,
  "partNumber": 1,
  "etag": "abc123def456",
  "size": 52428800
}
```

### 3. Complete Large File Upload

**POST** `/upload/complete-large/:sessionId`

Complete the multipart upload and process the file.

**Response:**

```json
{
  "success": true,
  "fileKey": "staging/username/large-document.pdf",
  "size": 150000000,
  "uploadedAt": "2024-01-01T12:00:00.000Z"
}
```

### 4. Get Upload Progress

**GET** `/upload/progress/:sessionId`

Get the current progress of an upload session.

**Response:**

```json
{
  "success": true,
  "progress": {
    "sessionId": "abc123def456",
    "filename": "large-document.pdf",
    "fileSize": 150000000,
    "totalParts": 3,
    "uploadedParts": 2,
    "status": "uploading",
    "progress": 66.67,
    "uploadedBytes": 104857600,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:05:00.000Z"
  }
}
```

### 5. Abort Large File Upload

**DELETE** `/upload/abort-large/:sessionId`

Abort an upload session and clean up resources.

**Response:**

```json
{
  "success": true,
  "message": "Upload aborted successfully"
}
```

## Client-Side Implementation

### JavaScript/TypeScript Example

```typescript
class LargeFileUploader {
  private sessionId: string | null = null;
  private totalParts: number = 0;
  private partSize: number = 0;

  async startUpload(file: File): Promise<void> {
    // Step 1: Start upload session
    const response = await fetch("/upload/start-large", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getJwtToken()}`,
      },
      body: JSON.stringify({
        filename: file.name,
        fileSize: file.size,
        contentType: file.type,
      }),
    });

    const data = await response.json();
    this.sessionId = data.sessionId;
    this.totalParts = data.totalParts;
    this.partSize = data.partSize;

    // Step 2: Upload parts
    await this.uploadParts(file);

    // Step 3: Complete upload
    await this.completeUpload();
  }

  private async uploadParts(file: File): Promise<void> {
    for (let partNumber = 1; partNumber <= this.totalParts; partNumber++) {
      const start = (partNumber - 1) * this.partSize;
      const end = Math.min(start + this.partSize, file.size);
      const chunk = file.slice(start, end);

      const response = await fetch(
        `/upload/part/${this.sessionId}/${partNumber}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getJwtToken()}`,
          },
          body: chunk,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to upload part ${partNumber}`);
      }

      // Update progress
      this.updateProgress(partNumber);
    }
  }

  private async completeUpload(): Promise<void> {
    const response = await fetch(`/upload/complete-large/${this.sessionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getJwtToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to complete upload");
    }

    const data = await response.json();
    console.log("Upload completed:", data.fileKey);
  }

  private updateProgress(partNumber: number): void {
    const progress = (partNumber / this.totalParts) * 100;
    console.log(`Upload progress: ${progress.toFixed(2)}%`);
  }

  async getProgress(): Promise<any> {
    if (!this.sessionId) return null;

    const response = await fetch(`/upload/progress/${this.sessionId}`, {
      headers: {
        Authorization: `Bearer ${getJwtToken()}`,
      },
    });

    const data = await response.json();
    return data.progress;
  }

  async abort(): Promise<void> {
    if (!this.sessionId) return;

    await fetch(`/upload/abort-large/${this.sessionId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getJwtToken()}`,
      },
    });
  }
}

// Usage
const uploader = new LargeFileUploader();
try {
  await uploader.startUpload(largeFile);
  console.log("Upload successful!");
} catch (error) {
  console.error("Upload failed:", error);
  await uploader.abort();
}
```

## Configuration

### File Size Thresholds

- **Small files**: < 100MB (direct upload)
- **Large files**: ≥ 100MB (multipart upload)
- **Part size**: 50MB per part
- **Maximum file size**: 100MB (practical limit due to Cloudflare Workers' 128MB memory limit with buffer)

### Environment Variables

No additional environment variables are required. The system uses existing R2 and Durable Object bindings.

## Security Features

1. **Authentication**: All endpoints require valid JWT authentication
2. **Authorization**: Users can only access their own upload sessions
3. **Session isolation**: Each upload session is isolated by user
4. **Server-side processing**: No client-side storage credentials exposed
5. **Automatic cleanup**: Abandoned sessions are cleaned up automatically

## Error Handling

### Common Error Scenarios

1. **File too small**: Files < 100MB should use direct upload
2. **Incomplete upload**: Cannot complete until all parts are uploaded
3. **Session not found**: Upload session may have expired or been deleted
4. **Access denied**: User doesn't own the upload session
5. **Storage unavailable**: R2 service temporarily unavailable

### Retry Strategy

- **Part uploads**: Can be retried individually
- **Session recovery**: Sessions persist across Worker instances
- **Automatic abort**: Incomplete multipart uploads are cleaned up

## Monitoring and Debugging

### Log Messages

The system provides detailed logging for debugging:

```
[LargeUpload] Started session: abc123 for file: large-file.pdf (150MB, 3 parts)
[LargeUpload] Uploaded part 1 for session abc123 (50MB)
[LargeUpload] Uploaded part 2 for session abc123 (50MB)
[LargeUpload] Uploaded part 3 for session abc123 (50MB)
[LargeUpload] Completed upload: abc123 -> staging/user/large-file.pdf
```

### Progress Tracking

Use the progress endpoint to monitor upload status:

```typescript
// Poll progress every 5 seconds
setInterval(async () => {
  const progress = await uploader.getProgress();
  if (progress) {
    console.log(`Progress: ${progress.progress}%`);
  }
}, 5000);
```

## Performance Considerations

1. **Parallel uploads**: Parts can be uploaded in parallel for better performance
2. **Memory usage**: Each part is processed independently to minimize memory usage
3. **Network efficiency**: 50MB parts provide good balance between efficiency and reliability
4. **Timeout handling**: Large files are less likely to timeout with chunked uploads

## Migration from Direct Uploads

Existing direct upload code can be easily adapted:

```typescript
// Before (direct upload)
const response = await fetch("/upload/direct/username/filename", {
  method: "PUT",
  body: file,
});

// After (large file upload)
if (file.size >= 100 * 1024 * 1024) {
  const uploader = new LargeFileUploader();
  await uploader.startUpload(file);
} else {
  // Use existing direct upload for small files
  const response = await fetch("/upload/direct/username/filename", {
    method: "PUT",
    body: file,
  });
}
```
