# Event Bus System Guide

This guide explains how to use the event bus system for managing asynchronous state updates in your application.

## Overview

The event bus system provides a centralized way to handle asynchronous operations and their state changes across the application. It solves the common problem of components not updating properly when async operations complete.

## Key Benefits

- **Decoupled Components**: Components don't need to know about each other's async operations
- **Centralized Event Handling**: All async events flow through a single system
- **Real-time Updates**: Components automatically update when relevant events occur
- **Easy Debugging**: Event history makes it easy to trace async operation flows
- **Type Safety**: Full TypeScript support with typed events

## Core Concepts

### Event Types

The system defines several event types for different async operations:

```typescript
type AsyncEventType =
  | "file.upload.started"
  | "file.upload.progress"
  | "file.upload.completed"
  | "file.upload.failed"
  | "autorag.sync.started"
  | "autorag.sync.progress"
  | "autorag.sync.completed"
  | "autorag.sync.failed"
  | "campaign.created"
  | "campaign.updated"
  | "campaign.deleted"
  | "snippet.generated"
  | "snippet.approved"
  | "snippet.rejected";
```

### Event Structure

All events follow a consistent structure:

```typescript
interface BaseEvent {
  type: AsyncEventType;
  timestamp: number;
  source: string; // Component or service that emitted the event
}
```

## Usage Examples

### 1. Basic Event Emission

```typescript
import { useEvent } from "../hooks/useAsyncState";

function MyComponent() {
  const send = useEvent();

  const handleFileUpload = async (file: File) => {
    // Send upload started event
    send({
      type: "file.upload.started",
      fileKey: "user123/file.pdf",
      filename: "file.pdf",
      source: "MyComponent",
    });

    try {
      // Perform upload...
      await uploadFile(file);

      // Send success event
      send({
        type: "file.upload.completed",
        fileKey: "user123/file.pdf",
        filename: "file.pdf",
        source: "MyComponent",
      });
    } catch (error) {
      // Send failure event
      send({
        type: "file.upload.failed",
        fileKey: "user123/file.pdf",
        filename: "file.pdf",
        error: error.message,
        source: "MyComponent",
      });
    }
  };
}
```

### 2. Listening to Events

```typescript
import { useEventBus } from '../lib/event-bus';

function FileStatusComponent({ fileKey }: { fileKey: string }) {
  const [status, setStatus] = useState('idle');

  // Listen for file upload events
  useEventBus('file.upload.started', (event) => {
    if (event.fileKey === fileKey) {
      setStatus('uploading');
    }
  });

  useEventBus('file.upload.completed', (event) => {
    if (event.fileKey === fileKey) {
      setStatus('completed');
    }
  });

  useEventBus('file.upload.failed', (event) => {
    if (event.fileKey === fileKey) {
      setStatus('failed');
    }
  });

  return <div>Status: {status}</div>;
}
```

### 3. Using Pre-built Hooks

The system provides several pre-built hooks for common use cases:

```typescript
import { useFileUploadStatus, useAutoRAGStatus } from '../hooks/useAsyncState';

function FileUploadComponent({ fileKey }: { fileKey: string }) {
  // Automatically tracks file upload status via events
  const { uploadState, emitUploadEvent } = useFileUploadStatus(fileKey);

  return (
    <div>
      <div>Status: {uploadState.status}</div>
      <div>Progress: {uploadState.progress}%</div>
      <div>Message: {uploadState.message}</div>
      {uploadState.error && <div>Error: {uploadState.error}</div>}
    </div>
  );
}

function AutoRAGComponent({ ragId, jobId }: { ragId: string; jobId: string }) {
  // Automatically tracks AutoRAG job status via events
  const { jobState, emitAutoRAGEvent } = useAutoRAGStatus(ragId, jobId);

  return (
    <div>
      <div>Status: {jobState.status}</div>
      <div>Progress: {jobState.progress}%</div>
      <div>Message: {jobState.message}</div>
    </div>
  );
}
```

### 4. Enhanced AutoRAG Polling

```typescript
import { useEnhancedAutoRAGPolling } from '../hooks/useEnhancedAutoRAGPolling';

function AutoRAGManager() {
  const { startPolling, stopPolling, jobStatus, isPolling } = useEnhancedAutoRAGPolling();

  const handleStartSync = async () => {
    const ragId = 'library-rag';
    const jobId = await triggerAutoRAGSync(ragId);

    // Start polling with file key for better event tracking
    startPolling(ragId, jobId, 'user123/file.pdf');
  };

  return (
    <div>
      <button onClick={handleStartSync} disabled={isPolling}>
        {isPolling ? 'Syncing...' : 'Start Sync'}
      </button>
      {jobStatus && <div>Job Status: {jobStatus.id}</div>}
    </div>
  );
}
```

## Debugging

### Event History

```typescript
import { eventBus } from "../lib/event-bus";

// Get recent events
const recentEvents = eventBus.getRecentEvents();
console.log("Recent events:", recentEvents);

// Get events of a specific type
const uploadEvents = eventBus.getRecentEvents("file.upload.started");
console.log("Upload events:", uploadEvents);
```

### Event Bus Demo Component

Use the `EventBusDemo` component to test event bus functionality:

```typescript
import { EventBusDemo } from '../components/EventBusDemo';

function TestPage() {
  return <EventBusDemo />;
}
```

## Troubleshooting

### Common Issues

1. **Events not being received**
   - Check that the event type matches exactly
   - Verify the component is still mounted
   - Check browser console for event bus logs

2. **State not updating**
   - Ensure events are being emitted with correct payload
   - Check that the event listener is set up correctly
   - Verify the component is using the right hook

3. **Memory leaks**
   - Event listeners are automatically cleaned up by the hooks
   - If using the raw event bus, remember to unsubscribe
