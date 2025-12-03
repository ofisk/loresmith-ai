import { getDocument } from "pdfjs-serverless";
import * as mammoth from "mammoth";

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
   * Extract text from PDF with page limit support for large files
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

      // Limit page extraction to prevent timeout during processing
      // Cloudflare Workers have a 30-second CPU time limit for all processing
      // Note: Queueing large files makes requests non-blocking but doesn't remove Worker time limits
      // For large PDFs, we limit to 500 pages to stay within the Worker time limit
      const MAX_PAGES_TO_EXTRACT = fileSizeMB > 100 ? 500 : numPages;
      const shouldLimitPages = numPages > MAX_PAGES_TO_EXTRACT;

      if (shouldLimitPages) {
        console.warn(
          `[FileExtractionService] WARNING: PDF has ${numPages} pages but file is ${fileSizeMB.toFixed(2)}MB. Limiting extraction to first ${MAX_PAGES_TO_EXTRACT} pages to prevent timeout.`
        );
      }

      const pageTexts: string[] = [];
      const pagesToExtract = Math.min(numPages, MAX_PAGES_TO_EXTRACT);

      // Extract text from each page
      for (let pageNum = 1; pageNum <= pagesToExtract; pageNum++) {
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

      // Join all pages with page breaks for context
      let fullText = pageTexts
        .map((text, index) => `[Page ${index + 1}]\n${text}`)
        .join("\n\n");

      if (shouldLimitPages) {
        fullText += `\n\n[NOTE: This PDF has ${numPages} total pages. Only the first ${pagesToExtract} pages were extracted due to file size limits.]`;
      }

      const extractedText =
        fullText || `File content extracted (${buffer.byteLength} bytes)`;

      return {
        text: extractedText,
        pagesExtracted: pagesToExtract,
        totalPages: numPages,
      };
    } catch (error) {
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
      throw new Error(
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
