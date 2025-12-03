import { FileExtractionService } from "./file-extraction-service";

const LARGE_FILE_THRESHOLD_MB = 100;

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
   * Large files (>100MB) should be queued to avoid timeout during processing
   * For PDFs >100MB with >500 pages, we also queue to avoid extraction timeout
   */
  async shouldQueueFile(
    file: { size?: number; arrayBuffer(): Promise<ArrayBuffer> },
    contentType: string
  ): Promise<{ shouldQueue: boolean; reason?: string }> {
    const fileSizeMB = (file.size || 0) / (1024 * 1024);

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
