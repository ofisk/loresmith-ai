import { FileExtractionService } from "./file-extraction-service";
import { estimateProcessingTime } from "@/lib/processing-time-estimator";

const LARGE_FILE_THRESHOLD_MB = 100;
// Cloudflare Workers have a 30-second wall-clock time limit (50s CPU time on paid plans)
// Queue files estimated to take longer than 25 seconds to avoid timeouts
const WORKER_TIMEOUT_SECONDS = 25;

/**
 * Utility functions for determining if files should be queued for background processing
 */
export class FileQueueUtils {
  private extractionService: FileExtractionService;

  constructor() {
    this.extractionService = new FileExtractionService();
  }

  /**
   * Check if a file should be queued for background processing
   * Files are queued if:
   * - File size > 100MB (large files)
   * - Estimated processing time > 25 seconds (to avoid Worker timeout)
   * - PDFs > 100MB with >500 pages (extraction timeout risk)
   */
  async shouldQueueFile(
    file: { size?: number; arrayBuffer(): Promise<ArrayBuffer> },
    contentType: string
  ): Promise<{ shouldQueue: boolean; reason?: string }> {
    const fileSizeMB = (file.size || 0) / (1024 * 1024);
    const fileSizeBytes = file.size || 0;

    // Check estimated processing time - queue if it exceeds Worker timeout
    const timeEstimate = estimateProcessingTime(fileSizeBytes);
    if (timeEstimate.estimatedSeconds > WORKER_TIMEOUT_SECONDS) {
      return {
        shouldQueue: true,
        reason: `File is ${fileSizeMB.toFixed(2)}MB with estimated processing time of ${timeEstimate.estimatedSeconds}s, which exceeds Worker timeout limits. Background processing required.`,
      };
    }

    // Queue any file >100MB - processing could timeout regardless of type
    if (fileSizeMB > LARGE_FILE_THRESHOLD_MB) {
      // For PDFs, also check page count as an additional factor
      if (contentType.includes("pdf")) {
        try {
          const buffer = await file.arrayBuffer();
          return await this.extractionService.shouldQueuePdf(
            buffer,
            fileSizeMB
          );
        } catch (error) {
          // If we can't check page count, still queue based on file size
          console.warn(
            `[FileQueueUtils] Could not check PDF page count, queueing based on file size:`,
            error
          );
        }
      }

      // Queue any large file (>100MB) regardless of type
      return {
        shouldQueue: true,
        reason: `File is ${fileSizeMB.toFixed(2)}MB. Large files require background processing to avoid timeout.`,
      };
    }

    return { shouldQueue: false };
  }
}
