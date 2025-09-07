# Event Bus System Guide

This guide explains how to use the new event bus system for managing asynchronous state updates in your application.

## Overview

The event bus system provides a centralized way to handle asynchronous operations and their state changes across your application. It solves the common problem of components not updating properly when async operations complete.

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
import { useEventEmitter } from "../hooks/useAsyncState";

function MyComponent() {
  const emit = useEventEmitter();

  const handleFileUpload = async (file: File) => {
    // Emit upload started event
    emit({
      type: "file.upload.started",
      fileKey: "user123/file.pdf",
      filename: "file.pdf",
      source: "MyComponent",
    });

    try {
      // Perform upload...
      await uploadFile(file);

      // Emit success event
      emit({
        type: "file.upload.completed",
        fileKey: "user123/file.pdf",
        filename: "file.pdf",
        source: "MyComponent",
      });
    } catch (error) {
      // Emit failure event
      emit({
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

## Migration Guide

### From Existing Polling to Event Bus

**Before (ResourceSidePanel):**

```typescript
// Manual state management with complex useEffect
useEffect(() => {
  if (jobStatus && currentUploadId) {
    const currentUpload = fileUploads.get(currentUploadId);
    if (currentUpload) {
      // Complex state update logic...
      setFileUploads((prev) => {
        // Manual state synchronization...
      });
    }
  }
}, [jobStatus, currentUploadId, fileUploads]);
```

**After (with Event Bus):**

```typescript
// Automatic state management via events
const { uploadState } = useFileUploadStatus(currentUploadId);

// State automatically updates when events are emitted
// No manual useEffect needed!
```

### Step-by-Step Migration

1. **Replace manual polling hooks** with enhanced versions:

   ```typescript
   // Old
   import { useAutoRAGPolling } from "../hooks/useAutoRAGPolling";

   // New
   import { useEnhancedAutoRAGPolling } from "../hooks/useEnhancedAutoRAGPolling";
   ```

2. **Replace manual state management** with event-driven hooks:

   ```typescript
   // Old
   const [uploadStatus, setUploadStatus] = useState("idle");

   // New
   const { uploadState } = useFileUploadStatus(fileKey);
   ```

3. **Emit events** instead of manually updating state:

   ```typescript
   // Old
   setUploadStatus("completed");

   // New
   emit({
     type: "file.upload.completed",
     fileKey,
     filename,
     source: "MyComponent",
   });
   ```

## Best Practices

### 1. Event Naming

- Use descriptive, hierarchical names: `file.upload.started`, `autorag.sync.completed`
- Follow the pattern: `domain.operation.state`

### 2. Event Sources

- Always include a meaningful `source` field
- Use component names or service names for easy debugging

### 3. Error Handling

- Always emit failure events with error details
- Include error messages in the event payload

### 4. Performance

- Use specific event types rather than listening to all events
- Clean up event listeners when components unmount (handled automatically by hooks)

### 5. Testing

- Use the `eventBus.clear()` method to reset state between tests
- Check event history with `eventBus.getRecentEvents()`

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

## Integration with Existing Code

The event bus system is designed to work alongside your existing code. You can:

1. **Gradually migrate** components one at a time
2. **Keep existing hooks** while adding new event-driven ones
3. **Mix approaches** during the transition period

### Example: Gradual Migration

```typescript
// Component can use both old and new approaches
function HybridComponent() {
  // Old approach (still works)
  const { jobStatus } = useAutoRAGPolling();

  // New approach (event-driven)
  const { uploadState } = useFileUploadStatus(fileKey);

  // Both will work together
  return (
    <div>
      <div>Old status: {jobStatus?.id}</div>
      <div>New status: {uploadState.status}</div>
    </div>
  );
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

### Debug Commands

```typescript
// Check current listeners
console.log("Event bus state:", eventBus);

// Clear all events and listeners
eventBus.clear();

// Get event history
const history = eventBus.getRecentEvents();
console.log("Event history:", history);
```

## Future Enhancements

The event bus system is designed to be extensible. Future enhancements could include:

- **Persistence**: Save event history to localStorage
- **Filtering**: More sophisticated event filtering
- **Metrics**: Event timing and performance metrics
- **Visualization**: Event flow diagrams
- **Testing**: Built-in testing utilities

## Conclusion

The event bus system provides a robust, scalable solution for managing asynchronous state in your application. It eliminates the common issues with manual state synchronization while providing excellent debugging capabilities and type safety.

Start by migrating one component at a time, and you'll quickly see the benefits of centralized, event-driven state management.
