import type { Env } from "../middleware/auth";
import type { FileMetadata } from "../types/upload";
import type { PdfStatus } from "../types/pdf";
import { getLibraryRagService } from "./service-factory";

export interface ProcessingResult {
  success: boolean;
  metadata?: {
    description: string;
    tags: string[];
  };
  vectorId?: string;
  error?: string;
  errorDetails?: string;
}

export interface ProcessingOptions {
  generateMetadata?: boolean;
  storeEmbeddings?: boolean;
  updateStatus?: boolean;
}

export class PDFProcessingService {
  constructor(private env: Env) {}

  /**
   * Process an uploaded PDF file with comprehensive error handling
   */
  async processUploadedFile(
    fileKey: string,
    username: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const {
      generateMetadata = true,
      storeEmbeddings = true,
      updateStatus = true,
    } = options;

    try {
      // Update status to processing if requested
      if (updateStatus) {
        await this.updateProcessingStatus(fileKey, "processing");
      }

      // Get file metadata from database
      const fileMetadata = await this.getFileMetadata(fileKey, username);
      if (!fileMetadata) {
        throw new Error("File metadata not found");
      }

      // Process the file using RAG service
      const ragService = getLibraryRagService(this.env);
      const result = await ragService.processPdfFromR2(
        fileKey,
        username,
        this.env.FILE_BUCKET,
        fileMetadata
      );

      // Update status to processed
      if (updateStatus) {
        await this.updateProcessingStatus(fileKey, "processed");
      }

      return {
        success: true,
        metadata:
          generateMetadata && result.suggestedMetadata
            ? result.suggestedMetadata
            : undefined,
        vectorId:
          storeEmbeddings && result.vectorId ? result.vectorId : undefined,
      };
    } catch (error) {
      const errorInfo = this.categorizeError(error as Error);

      // Update status to error
      if (updateStatus) {
        await this.updateProcessingStatus(fileKey, "error");
      }

      return {
        success: false,
        error: errorInfo.message,
        errorDetails: errorInfo.details,
      };
    }
  }

  /**
   * Update processing status in database
   */
  async updateProcessingStatus(
    fileKey: string,
    status: PdfStatus,
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      await this.env.DB.prepare(
        "UPDATE pdf_files SET status = ?, updated_at = ?, error_message = ? WHERE file_key = ?"
      )
        .bind(status, updateData.updated_at, errorMessage || null, fileKey)
        .run();
    } catch (error) {
      console.error(`[PDFProcessingService] Error updating status:`, error);
    }
  }

  /**
   * Get file metadata from database
   */
  private async getFileMetadata(
    fileKey: string,
    username: string
  ): Promise<FileMetadata | null> {
    try {
      const result = await this.env.DB.prepare(
        "SELECT * FROM pdf_files WHERE file_key = ? AND username = ?"
      )
        .bind(fileKey, username)
        .first();

      if (!result) {
        return null;
      }

      return {
        id: result.id as string,
        fileKey: result.file_key as string,
        userId: result.username as string,
        filename: result.file_name as string,
        fileSize: result.file_size as number,
        contentType: "application/pdf",
        description: result.description as string,
        tags: result.tags ? JSON.parse(result.tags as string) : [],
        status: result.status as PdfStatus,
        createdAt: result.created_at as string,
        updatedAt: result.updated_at as string,
      };
    } catch (error) {
      console.error(
        `[PDFProcessingService] Error getting file metadata:`,
        error
      );
      return null;
    }
  }

  /**
   * Categorize and format errors for consistent handling
   */
  private categorizeError(error: Error): { message: string; details: string } {
    const errorMessage = error.message;
    let message = "PDF processing failed";
    let details = errorMessage;

    if (errorMessage.includes("Unavailable content in PDF document")) {
      message = "Unavailable content in PDF document";
      details =
        "The PDF file could not be parsed. It may be encrypted, corrupted, or contain no readable text.";
    } else if (errorMessage.includes("timeout")) {
      message = "PDF processing timeout";
      details = "The PDF processing took too long and was cancelled.";
    } else if (errorMessage.includes("not found in R2")) {
      message = "File not found in storage";
      details = "The uploaded file could not be found in storage.";
    } else if (errorMessage.includes("No OpenAI API key")) {
      message = "OpenAI API key required";
      details = "PDF processing requires an OpenAI API key for text analysis.";
    }

    return { message, details };
  }
}
