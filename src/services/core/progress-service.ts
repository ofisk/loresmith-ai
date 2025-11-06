import type { ProcessingProgress, ProgressMessage } from "@/types/progress";

// Progress tracking store
const progressStore = new Map<string, ProcessingProgress>();
const progressSubscribers = new Map<string, Set<WebSocket>>();

// Progress management functions
export function updateProgress(fileKey: string, progress: ProcessingProgress) {
  progressStore.set(fileKey, progress);

  // Notify subscribers
  const subscribers = progressSubscribers.get(fileKey);
  if (subscribers) {
    const message: ProgressMessage = {
      type: "progress_update",
      data: progress,
    };

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }
}

export function subscribeToProgress(fileKey: string, ws: WebSocket) {
  if (!progressSubscribers.has(fileKey)) {
    progressSubscribers.set(fileKey, new Set());
  }
  progressSubscribers.get(fileKey)!.add(ws);

  // Send current progress if available
  const currentProgress = progressStore.get(fileKey);
  if (currentProgress) {
    const message: ProgressMessage = {
      type: "progress_update",
      data: currentProgress,
    };
    ws.send(JSON.stringify(message));
  }
}

export function unsubscribeFromProgress(fileKey: string, ws: WebSocket) {
  const subscribers = progressSubscribers.get(fileKey);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      progressSubscribers.delete(fileKey);
    }
  }
}

export function completeProgress(
  fileKey: string,
  success: boolean,
  error?: string,
  suggestedMetadata?: any
) {
  const message: ProgressMessage = {
    type: "progress_complete",
    data: {
      fileKey,
      success,
      error,
      suggestedMetadata,
    },
  };

  const subscribers = progressSubscribers.get(fileKey);
  if (subscribers) {
    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  // Clean up
  progressStore.delete(fileKey);
  progressSubscribers.delete(fileKey);
}
