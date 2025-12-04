import type { ChunkDefinition } from "@/types/upload";
import { getPdfPageCount } from "@/lib/pdf-utils";

/**
 * Service for determining how to chunk PDFs into processable page ranges
 */
export class PDFChunkingService {
  /**
   * Calculate page ranges for chunking a PDF
   * @param totalPages - Total number of pages in the PDF
   * @param fileSizeMB - File size in MB
   * @returns Array of chunk definitions with page ranges
   */
  calculatePageRanges(
    totalPages: number,
    fileSizeMB: number
  ): ChunkDefinition[] {
    // Target: ~50-100 pages per chunk for PDFs
    // Adjust based on file size to stay under memory limits
    const PAGES_PER_CHUNK = fileSizeMB > 200 ? 50 : 100;
    const chunks: ChunkDefinition[] = [];

    const totalChunks = Math.ceil(totalPages / PAGES_PER_CHUNK);

    for (let i = 0; i < totalChunks; i++) {
      const startPage = i * PAGES_PER_CHUNK + 1;
      const endPage = Math.min((i + 1) * PAGES_PER_CHUNK, totalPages);

      chunks.push({
        chunkIndex: i,
        totalChunks,
        pageRangeStart: startPage,
        pageRangeEnd: endPage,
      });
    }

    return chunks;
  }

  /**
   * Determine if a PDF needs to be chunked based on size
   * @param fileSizeMB - File size in MB
   * @param totalPages - Total number of pages (optional, for more accurate estimation)
   * @returns Object indicating if chunking is needed
   */
  shouldChunkPdf(
    fileSizeMB: number,
    totalPages?: number
  ): { shouldChunk: boolean; reason?: string } {
    // Files over 128MB definitely need chunking
    const MEMORY_LIMIT_MB = 128;
    const SAFE_THRESHOLD_MB = 100;

    if (fileSizeMB > MEMORY_LIMIT_MB) {
      return {
        shouldChunk: true,
        reason: `File (${fileSizeMB.toFixed(2)}MB) exceeds Worker memory limit (128MB).`,
      };
    }

    // Files close to the limit should be chunked preemptively
    if (fileSizeMB > SAFE_THRESHOLD_MB) {
      // If we have page count, use it to estimate
      if (totalPages) {
        const avgPageSizeMB = fileSizeMB / totalPages;
        const estimatedMemoryUsage = avgPageSizeMB * 50; // Estimate for processing

        if (estimatedMemoryUsage > SAFE_THRESHOLD_MB) {
          return {
            shouldChunk: true,
            reason: `File (${fileSizeMB.toFixed(2)}MB, ${totalPages} pages) may exceed memory limits during processing.`,
          };
        }
      } else {
        // Without page count, be conservative
        return {
          shouldChunk: true,
          reason: `File (${fileSizeMB.toFixed(2)}MB) is large and may exceed memory limits during processing.`,
        };
      }
    }

    return { shouldChunk: false };
  }

  /**
   * Determine if a PDF needs to be chunked based on size and buffer
   * This method can automatically get page count from the buffer if needed
   * @param fileSizeMB - File size in MB
   * @param buffer - PDF buffer (optional, if provided will get page count automatically)
   * @returns Object indicating if chunking is needed
   */
  async shouldChunkPdfWithBuffer(
    fileSizeMB: number,
    buffer?: ArrayBuffer
  ): Promise<{ shouldChunk: boolean; reason?: string; totalPages?: number }> {
    let totalPages: number | undefined;

    // If buffer is provided, get page count for more accurate estimation
    if (buffer) {
      try {
        totalPages = await getPdfPageCount(buffer);
      } catch (error) {
        console.warn(
          `[PDFChunkingService] Could not get page count from buffer, using size-based estimation:`,
          error
        );
        // Continue with size-based estimation if page count fails
      }
    }

    const result = this.shouldChunkPdf(fileSizeMB, totalPages);
    return {
      ...result,
      totalPages,
    };
  }
}
