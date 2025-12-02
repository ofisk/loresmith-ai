/**
 * Standardized result type for file processing operations
 */
export interface FileProcessingResult {
  success: boolean;
  queued: boolean;
  message: string;
  jobId?: string;
  error?: string;
}
