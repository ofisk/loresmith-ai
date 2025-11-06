/**
 * Utility functions for estimating file processing times
 */

export interface ProcessingTimeEstimate {
  estimatedMinutes: number;
  estimatedSeconds: number;
  category: "small" | "medium" | "large" | "very-large";
  description: string;
}

/**
 * Calculate estimated processing time based on file size
 */
export function estimateProcessingTime(
  fileSizeBytes: number
): ProcessingTimeEstimate {
  const fileSizeMB = fileSizeBytes / (1024 * 1024);

  let estimatedMinutes: number;
  let category: "small" | "medium" | "large" | "very-large";
  let description: string;

  if (fileSizeMB < 1) {
    // Small files (< 1MB): 30-60 seconds
    estimatedMinutes = 0.75; // 45 seconds average
    category = "small";
    description = "Small file - should process quickly";
  } else if (fileSizeMB < 10) {
    // Medium files (1-10MB): 1-3 minutes
    estimatedMinutes = 2; // 2 minutes average
    category = "medium";
    description = "Medium file - processing in progress";
  } else if (fileSizeMB < 50) {
    // Large files (10-50MB): 3-10 minutes
    estimatedMinutes = 6; // 6 minutes average
    category = "large";
    description = "Large file - this may take several minutes";
  } else {
    // Very large files (> 50MB): 10+ minutes
    estimatedMinutes = 15; // 15 minutes average
    category = "very-large";
    description = "Very large file - processing may take 10+ minutes";
  }

  return {
    estimatedMinutes,
    estimatedSeconds: Math.round(estimatedMinutes * 60),
    category,
    description,
  };
}

/**
 * Compute timeout seconds using the estimated processing time with a buffer multiplier.
 * - Clamp base estimate between 120s and 2700s
 * - Default bufferMultiplier = 1.5 to reduce false positives
 * Pass bufferMultiplier = 1 to get an unbuffered value (suitable for UI “~Estimate”).
 */
export function getTimeoutSeconds(
  fileSizeBytes: number,
  bufferMultiplier = 1.5
): number {
  const baseSeconds = estimateProcessingTime(fileSizeBytes).estimatedSeconds;
  const clamped = Math.max(120, Math.min(baseSeconds, 45 * 60));
  return Math.floor(clamped * bufferMultiplier);
}

/**
 * Evaluate whether an operation has exceeded its expected timeout window.
 * referenceTime can be a Date, timestamp (ms), or ISO string.
 */
export function evaluateTimeout(
  fileSizeBytes: number,
  referenceTime: Date | number | string,
  bufferMultiplier = 1.5
): { ageSeconds: number; timeoutSeconds: number; timedOut: boolean } {
  const refMs =
    typeof referenceTime === "number"
      ? referenceTime
      : new Date(referenceTime).getTime();
  const ageSeconds = Math.floor((Date.now() - refMs) / 1000);
  const timeoutSeconds = getTimeoutSeconds(fileSizeBytes, bufferMultiplier);
  return { ageSeconds, timeoutSeconds, timedOut: ageSeconds > timeoutSeconds };
}

/**
 * Format processing time estimate for display
 */
export function formatProcessingTime(estimate: ProcessingTimeEstimate): string {
  if (estimate.estimatedMinutes < 1) {
    return `${estimate.estimatedSeconds} seconds`;
  } else if (estimate.estimatedMinutes < 60) {
    return `${Math.round(estimate.estimatedMinutes)} minutes`;
  } else {
    const hours = Math.floor(estimate.estimatedMinutes / 60);
    const minutes = Math.round(estimate.estimatedMinutes % 60);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Get a user-friendly message about processing time
 */
export function getProcessingTimeMessage(
  fileSizeBytes: number,
  _fileName: string
): string {
  const estimate = estimateProcessingTime(fileSizeBytes);
  const timeStr = formatProcessingTime(estimate);

  return `${estimate.description}. Estimated processing time: ${timeStr}.`;
}

/**
 * Get processing time estimate for chat agent
 */
export function getChatAgentEstimate(
  fileSizeBytes: number,
  fileName: string
): string {
  const estimate = estimateProcessingTime(fileSizeBytes);
  const timeStr = formatProcessingTime(estimate);

  const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);

  return `The file "${fileName}" (${sizeMB}MB) is currently being processed by AutoRAG. ${estimate.description} Estimated processing time: ${timeStr}. You'll receive a notification when it's ready to use.`;
}
