import { getDocument } from "pdfjs-serverless";
import { MemoryLimitError, PDFExtractionError } from "./errors";
import type { ExtractionResult } from "@/services/file/file-extraction-service";

/**
 * PDF utility functions for chunking and page-level operations
 * These are pure utility functions that can be reused across services
 */

/**
 * Get PDF page count without extracting text
 * Useful for determining chunking strategy before processing
 */
export async function getPdfPageCount(buffer: ArrayBuffer): Promise<number> {
  try {
    const pdf = await getDocument({
      data: new Uint8Array(buffer),
    }).promise;
    return pdf.numPages;
  } catch (error) {
    const fileSizeMB = buffer.byteLength / (1024 * 1024);
    const memoryLimitError = MemoryLimitError.fromRuntimeError(
      error,
      fileSizeMB,
      128
    );
    if (memoryLimitError) {
      throw memoryLimitError;
    }
    throw new PDFExtractionError(
      `Failed to get PDF page count: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract text from a specific page range of a PDF
 * Note: PDF.js requires the full PDF buffer to parse, so this method still needs the full buffer
 * but only extracts the specified page range
 */
export async function extractPdfPagesRange(
  buffer: ArrayBuffer,
  startPage: number,
  endPage: number,
  totalPages?: number
): Promise<ExtractionResult> {
  try {
    const pdf = await getDocument({
      data: new Uint8Array(buffer),
    }).promise;

    const numPages = totalPages || pdf.numPages;
    const actualStartPage = Math.max(1, Math.min(startPage, numPages));
    const actualEndPage = Math.max(
      actualStartPage,
      Math.min(endPage, numPages)
    );

    if (actualStartPage > actualEndPage) {
      throw new Error(
        `Invalid page range: start (${startPage}) must be <= end (${endPage})`
      );
    }

    console.log(
      `[PDFUtils] Extracting pages ${actualStartPage}-${actualEndPage} of ${numPages}`
    );

    const pageTexts: string[] = [];

    for (let pageNum = actualStartPage; pageNum <= actualEndPage; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const pageText = textContent.items.map((item: any) => item.str).join(" ");

      if (pageText.trim().length > 0) {
        pageTexts.push(`[Page ${pageNum}]\n${pageText}`);
      }
    }

    const extractedText =
      pageTexts.join("\n\n") ||
      `No text extracted from pages ${actualStartPage}-${actualEndPage}`;

    return {
      text: extractedText,
      pagesExtracted: actualEndPage - actualStartPage + 1,
      totalPages: numPages,
    };
  } catch (error) {
    const fileSizeMB = buffer.byteLength / (1024 * 1024);
    const memoryLimitError = MemoryLimitError.fromRuntimeError(
      error,
      fileSizeMB,
      128
    );
    if (memoryLimitError) {
      throw memoryLimitError;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new PDFExtractionError(
      `Failed to extract pages ${startPage}-${endPage} from PDF: ${errorMessage}`
    );
  }
}
