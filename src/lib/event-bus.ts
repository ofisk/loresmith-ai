import { useCallback, useEffect, useRef } from "react";

// Event type constants to avoid typos
export const EVENT_TYPES = {
  FILE_UPLOAD: {
    STARTED: "file.upload.started",
    PROGRESS: "file.upload.progress",
    COMPLETED: "file.upload.completed",
    FAILED: "file.upload.failed",
  },
  AUTORAG_SYNC: {
    STARTED: "autorag.sync.started",
    PROGRESS: "autorag.sync.progress",
    COMPLETED: "autorag.sync.completed",
    FAILED: "autorag.sync.failed",
  },
  CAMPAIGN: {
    CREATED: "campaign.created",
    UPDATED: "campaign.updated",
    DELETED: "campaign.deleted",
  },
  SNIPPET: {
    GENERATED: "snippet.generated",
    APPROVED: "snippet.approved",
    REJECTED: "snippet.rejected",
  },
} as const;

// Event types for different async operations
export type AsyncEventType =
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

// Base event interface
export interface BaseEvent {
  type: AsyncEventType;
  timestamp: number;
  source: string; // Component or service that emitted the event
}

// Specific event interfaces
export interface FileUploadEvent extends BaseEvent {
  type:
    | "file.upload.started"
    | "file.upload.progress"
    | "file.upload.completed"
    | "file.upload.failed";
  fileKey: string;
  filename: string;
  progress?: number;
  error?: string;
}

export interface AutoRAGEvent extends BaseEvent {
  type:
    | "autorag.sync.started"
    | "autorag.sync.progress"
    | "autorag.sync.completed"
    | "autorag.sync.failed";
  ragId: string;
  jobId: string;
  fileKey?: string;
  progress?: number;
  error?: string;
}

export interface CampaignEvent extends BaseEvent {
  type: "campaign.created" | "campaign.updated" | "campaign.deleted";
  campaignId: string;
  campaignName: string;
}

export interface SnippetEvent extends BaseEvent {
  type: "snippet.generated" | "snippet.approved" | "snippet.rejected";
  snippetId: string;
  campaignId: string;
  fileKey: string;
}

export type AsyncEvent =
  | FileUploadEvent
  | AutoRAGEvent
  | CampaignEvent
  | SnippetEvent;

// Event listener type
export type EventListener<T extends AsyncEvent = AsyncEvent> = (
  event: T
) => void;

// Event bus class
class EventBus {
  private listeners = new Map<AsyncEventType, Set<EventListener>>();
  private eventHistory: AsyncEvent[] = [];
  private maxHistorySize = 100;

  // Subscribe to events
  subscribe<T extends AsyncEvent>(
    eventType: AsyncEventType,
    listener: EventListener<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(listener as EventListener);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(listener as EventListener);
        if (listeners.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  // Emit an event
  emit(event: Omit<AsyncEvent, "timestamp">): void {
    const fullEvent: AsyncEvent = {
      ...event,
      timestamp: Date.now(),
    } as AsyncEvent;

    // Add to history
    this.eventHistory.push(fullEvent);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify listeners
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(fullEvent);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }

    console.log(`[EventBus] Emitted ${event.type}:`, fullEvent);
  }

  // Get recent events (useful for debugging)
  getRecentEvents(eventType?: AsyncEventType, limit = 10): AsyncEvent[] {
    let events = this.eventHistory;

    if (eventType) {
      events = events.filter((event) => event.type === eventType);
    }

    return events.slice(-limit);
  }

  // Clear all listeners (useful for testing)
  clear(): void {
    this.listeners.clear();
    this.eventHistory = [];
  }
}

// Global event bus instance
export const eventBus = new EventBus();

// React hook for subscribing to events
export function useEventBus<T extends AsyncEvent>(
  eventType: AsyncEventType,
  listener: EventListener<T>,
  deps: React.DependencyList = []
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const stableListener: EventListener<T> = (event) => {
      listenerRef.current(event);
    };

    return eventBus.subscribe(eventType, stableListener);
  }, [eventType, ...deps]);
}

// React hook for emitting events
export function useEventEmitter() {
  return useCallback((event: Omit<AsyncEvent, "timestamp">) => {
    eventBus.emit(event);
  }, []);
}
