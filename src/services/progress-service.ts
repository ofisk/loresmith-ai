// Simple progress service stub
// This replaces the deleted progress-service.ts with minimal functionality

/**
 * Subscribe to progress updates for a file
 * @param fileKey - The file key to track
 * @param websocket - The WebSocket connection
 */
export function subscribeToProgress(
  fileKey: string,
  websocket: WebSocket
): void {
  console.log(`[ProgressService] Subscribing to progress for file: ${fileKey}`);
  // Simple implementation - just log the subscription
  // In a real implementation, this would track progress and send updates
}

/**
 * Complete progress tracking for a file
 * @param fileKey - The file key
 * @param success - Whether the operation was successful
 * @param error - Error message if failed
 */
export function completeProgress(
  fileKey: string,
  success: boolean,
  error?: string
): void {
  console.log(
    `[ProgressService] Progress complete for file: ${fileKey}, success: ${success}${error ? `, error: ${error}` : ""}`
  );
  // Simple implementation - just log the completion
  // In a real implementation, this would notify subscribers
}
