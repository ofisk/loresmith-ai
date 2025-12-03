import { getDocument } from "pdfjs-serverless";
import * as mammoth from "mammoth";
import { MemoryLimitError, PDFExtractionError } from "@/lib/errors";

export interface ExtractionResult {
  text: string;
  pagesExtracted?: number;
  totalPages?: number;
}

/**
 * Service for extracting text from various file types
 * Handles PDF, DOCX, text, and JSON files
 */
export class FileExtractionService {
  /**
   * Extract text from a file buffer based on content type
   */
  async extractText(
    buffer: ArrayBuffer,
    contentType: string
  ): Promise<ExtractionResult | null> {
    if (contentType.includes("pdf")) {
      return await this.extractPdfText(buffer);
    } else if (
      contentType.includes("wordprocessingml") ||
      contentType.includes("msword") ||
      contentType.includes("docx") ||
      contentType.includes("doc")
    ) {
      return await this.extractDocxText(buffer);
    } else if (contentType.includes("text")) {
      return { text: new TextDecoder().decode(buffer) };
    } else if (contentType.includes("json")) {
      const text = new TextDecoder().decode(buffer);
      try {
        const json = JSON.parse(text);
        return { text: JSON.stringify(json, null, 2) };
      } catch {
        return { text };
      }
    }

    return null;
  }

  /**
   * Extract text from PDF - extracts ALL pages to avoid content loss
   * Uses incremental batch processing with delays to avoid Worker timeouts
   */
  async extractPdfText(buffer: ArrayBuffer): Promise<ExtractionResult> {
    try {
      const pdf = await getDocument({
        data: new Uint8Array(buffer),
      }).promise;

      const numPages = pdf.numPages;
      const fileSizeMB = buffer.byteLength / (1024 * 1024);
      console.log(
        `[FileExtractionService] PDF has ${numPages} pages, file size: ${fileSizeMB.toFixed(2)}MB`
      );

      // Process all pages incrementally to avoid timeouts
      // Extract pages in batches with small delays to yield CPU time
      const pageTexts: string[] = [];
      const BATCH_SIZE = 50; // Process 50 pages at a time
      const BATCH_DELAY_MS = 10; // 10ms delay between batches to yield CPU time

      // Extract text from all pages in batches
      for (
        let batchStart = 1;
        batchStart <= numPages;
        batchStart += BATCH_SIZE
      ) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, numPages);

        // Process pages in this batch
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();

          // Combine all text items from the page
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");

          if (pageText.trim().length > 0) {
            pageTexts.push(pageText);
          }
        }

        // Add delay between batches to yield CPU time and avoid timeout
        // Only delay if there are more pages to process
        if (batchEnd < numPages) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }

        // Log progress for large files
        if (numPages > 100 && batchEnd % 100 === 0) {
          console.log(
            `[FileExtractionService] Extracted ${batchEnd}/${numPages} pages (${((batchEnd / numPages) * 100).toFixed(1)}%)`
          );
        }
      }

      console.log(
        `[FileExtractionService] Successfully extracted all ${numPages} pages from PDF`
      );

      // Join all pages with page breaks for context
      const fullText = pageTexts
        .map((text, index) => `[Page ${index + 1}]\n${text}`)
        .join("\n\n");

      const extractedText =
        fullText || `File content extracted (${buffer.byteLength} bytes)`;

      return {
        text: extractedText,
        pagesExtracted: numPages, // All pages extracted
        totalPages: numPages,
      };
    } catch (error) {
      // Boundary conversion: Convert runtime errors to structured MemoryLimitError
      // This handles errors from Cloudflare Workers runtime or pdfjs that we can't control
      const fileSizeMB = buffer.byteLength / (1024 * 1024);
      const memoryLimitError = MemoryLimitError.fromRuntimeError(
        error,
        fileSizeMB,
        128
      );
      if (memoryLimitError) {
        throw memoryLimitError;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(
        `[FileExtractionService] PDF text extraction failed:`,
        errorMessage
      );
      if (errorStack) {
        console.error(
          `[FileExtractionService] Extraction error stack:`,
          errorStack
        );
      }
      throw new PDFExtractionError(
        `Failed to extract text from PDF: ${errorMessage}. The file may be corrupted, encrypted, or too large.`
      );
    }
  }

  /**
   * Extract text from DOCX files
   */
  async extractDocxText(buffer: ArrayBuffer): Promise<ExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      const extractedText = result.value || "";

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error(
          "No text content found in the document. The file may be empty or contain only images."
        );
      }

      return {
        text: extractedText,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(
        `[FileExtractionService] DOCX text extraction failed:`,
        errorMessage
      );
      if (errorStack) {
        console.error(
          `[FileExtractionService] Extraction error stack:`,
          errorStack
        );
      }
      throw new Error(
        `Failed to extract text from DOCX: ${errorMessage}. The file may be corrupted, encrypted, or in an unsupported format.`
      );
    }
  }

  /**
   * Check if a PDF should be queued based on size and page count
   */
  async shouldQueuePdf(
    buffer: ArrayBuffer,
    fileSizeMB: number
  ): Promise<{ shouldQueue: boolean; reason?: string }> {
    const LARGE_FILE_THRESHOLD_MB = 100;
    const MAX_PAGES_TO_EXTRACT = 500;

    if (fileSizeMB <= LARGE_FILE_THRESHOLD_MB) {
      return { shouldQueue: false };
    }

    try {
      const pdf = await getDocument({
        data: new Uint8Array(buffer),
      }).promise;

      const numPages = pdf.numPages;

      if (numPages > MAX_PAGES_TO_EXTRACT) {
        return {
          shouldQueue: true,
          reason: `File is ${fileSizeMB.toFixed(2)}MB with ${numPages} pages. Large PDFs require background processing to avoid timeout.`,
        };
      }
    } catch (error) {
      console.warn(
        `[FileExtractionService] Could not check PDF page count, queueing based on file size:`,
        error
      );
    }

    return {
      shouldQueue: true,
      reason: `File is ${fileSizeMB.toFixed(2)}MB. Large files require background processing to avoid timeout.`,
    };
  }
}
