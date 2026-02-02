// Direct file content extraction provider implementation
// Reads files directly from R2 and extracts text content
import type { Env } from "@/middleware/auth";
import type {
  ContentExtractionProvider,
  ContentExtractionOptions,
  ContentExtractionResult,
} from "../content-extraction-provider";
// biome-ignore lint/style/useImportType: R2Helper is used as both type and class (methods called on instance)
import { R2Helper } from "@/lib/r2";
import { PDFExtractionError } from "@/lib/errors";

/**
 * Direct file content extraction provider
 * Reads files directly from R2 and extracts text using proper PDF parsing libraries
 */
export class DirectFileContentExtractionProvider implements ContentExtractionProvider {
  constructor(
    _env: Env,
    private r2Helper: R2Helper
  ) {}

  async extractContent(
    options: ContentExtractionOptions
  ): Promise<ContentExtractionResult> {
    try {
      const { resource } = options;

      if (!resource.file_key) {
        return {
          content: "",
          success: false,
          error: `File key is required for resource: ${resource.id}`,
        };
      }

      // Get file from R2
      const fileBuffer = await this.r2Helper.get(resource.file_key);
      if (!fileBuffer) {
        return {
          content: "",
          success: false,
          error: `File not found in R2: ${resource.file_key}`,
        };
      }

      // Get content type from R2 metadata
      const contentType = await this.r2Helper.getContentType(resource.file_key);

      // Extract text based on content type
      let extractedText: string;
      let isPDF = false;

      if (
        contentType?.includes("pdf") ||
        resource.file_name?.endsWith(".pdf")
      ) {
        extractedText = await this.extractTextFromPDF(fileBuffer);
        isPDF = true;
      } else if (
        contentType?.includes("text") ||
        resource.file_name?.endsWith(".txt") ||
        resource.file_name?.endsWith(".md") ||
        resource.file_name?.endsWith(".mdx")
      ) {
        extractedText = new TextDecoder().decode(fileBuffer);
      } else if (
        contentType?.includes("json") ||
        resource.file_name?.endsWith(".json")
      ) {
        const text = new TextDecoder().decode(fileBuffer);
        try {
          const json = JSON.parse(text);
          extractedText = JSON.stringify(json, null, 2);
        } catch {
          extractedText = text;
        }
      } else if (this.isImageType(contentType)) {
        // Placeholder for future image/vision API support
        return {
          content: "",
          success: false,
          error: `Image extraction not yet implemented. Content type: ${contentType}`,
        };
      } else {
        // Try to decode as text for unknown types
        try {
          extractedText = new TextDecoder().decode(fileBuffer);
        } catch {
          return {
            content: "",
            success: false,
            error: `Unsupported file type: ${contentType || "unknown"}`,
          };
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        return {
          content: "",
          success: false,
          error: `No text content extracted from file: ${resource.file_key}`,
        };
      }

      return {
        content: extractedText,
        success: true,
        metadata: {
          isPDF,
          contentType: contentType || "unknown",
        },
      };
    } catch (error) {
      console.error(
        `[DirectFileContentExtractionProvider] Error extracting content:`,
        error
      );
      return {
        content: "",
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown extraction error",
      };
    }
  }

  /**
   * Extract text from PDF using pdfjs-serverless
   * Designed for edge/serverless environments like Cloudflare Workers
   * Extracts text page by page to enable chunking
   */
  private async extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
    try {
      // Dynamically import pdfjs-serverless (designed for Workers)
      const { getDocument } = await import("pdfjs-serverless");

      // Load the PDF document
      const pdf = await getDocument({
        data: new Uint8Array(buffer),
      }).promise;

      const numPages = pdf.numPages;
      console.log(
        `[DirectFileContentExtractionProvider] PDF has ${numPages} pages`
      );

      const pageTexts: string[] = [];

      // Extract text from each page
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
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
      const fullText = pageTexts
        .map((text, index) => `[Page ${index + 1}]\n${text}`)
        .join("\n\n");

      return fullText;
    } catch (error) {
      console.error(
        `[DirectFileContentExtractionProvider] Error extracting PDF text:`,
        error
      );
      throw new PDFExtractionError(
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Check if content type is an image
   * Placeholder for future vision API support
   */
  private isImageType(contentType: string | null): boolean {
    if (!contentType) {
      return false;
    }
    return (
      contentType.startsWith("image/") ||
      contentType.includes("image") ||
      /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(contentType)
    );
  }

  // TODO: Add extractFromImage() method when implementing OpenAI Vision API support
  // This will use OpenAI's vision API to extract text and context from images
  // Useful for campaign planning inspiration images
}
