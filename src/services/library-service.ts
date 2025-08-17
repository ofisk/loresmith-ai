import type { Env } from "../middleware/auth";
import type { FileMetadata } from "../types/upload";
import { getDAOFactory } from "../dao/dao-factory";
import { getLibraryRagService } from "./service-factory";

export interface StorageUsage {
  username: string;
  totalBytes: number;
  fileCount: number;
  isAdmin: boolean;
  limitBytes: number;
  remainingBytes: number;
  usagePercentage: number;
}

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

export class LibraryService {
  private readonly env: Env;
  private readonly STORAGE_LIMIT_BYTES = 20 * 1024 * 1024; // 20MB for regular users

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Get storage usage for a user
   */
  async getUserStorageUsage(
    username: string,
    isAdmin: boolean
  ): Promise<StorageUsage> {
    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;

      // Get all files for the user
      const files = await fileDAO.getFilesForRag(username);

      // Calculate total bytes and file count (excluding error status)
      const validFiles = files.filter((file: any) => file.status !== "error");
      const totalBytes = validFiles.reduce(
        (sum: number, file: any) => sum + (file.file_size || 0),
        0
      );
      const fileCount = validFiles.length;

      // Admin users have unlimited storage
      const limitBytes = isAdmin ? Infinity : this.STORAGE_LIMIT_BYTES;
      const remainingBytes = isAdmin
        ? Infinity
        : Math.max(0, limitBytes - totalBytes);
      const usagePercentage = isAdmin ? 0 : (totalBytes / limitBytes) * 100;

      return {
        username,
        totalBytes,
        fileCount,
        isAdmin,
        limitBytes,
        remainingBytes,
        usagePercentage,
      };
    } catch (error) {
      console.error(
        "[LibraryService] Error getting user storage usage:",
        error
      );
      throw new Error("Failed to get storage usage");
    }
  }

  /**
   * Check if user can upload a file of given size
   */
  async canUploadFile(
    username: string,
    fileSizeBytes: number,
    isAdmin: boolean
  ): Promise<{
    canUpload: boolean;
    reason?: string;
    currentUsage: StorageUsage;
  }> {
    const currentUsage = await this.getUserStorageUsage(username, isAdmin);

    if (isAdmin) {
      return {
        canUpload: true,
        currentUsage,
      };
    }

    const wouldExceedLimit =
      currentUsage.totalBytes + fileSizeBytes > this.STORAGE_LIMIT_BYTES;

    if (wouldExceedLimit) {
      return {
        canUpload: false,
        reason: `Upload would exceed your ${this.formatBytes(this.STORAGE_LIMIT_BYTES)} storage limit. Current usage: ${this.formatBytes(currentUsage.totalBytes)}`,
        currentUsage,
      };
    }

    return {
      canUpload: true,
      currentUsage,
    };
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Get storage usage for all users (admin only)
   */
  async getAllUsersStorageUsage(): Promise<StorageUsage[]> {
    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;

      // Get all files and group by username
      const allFiles = await fileDAO.getAllFilesForStorageUsage();

      // Group files by username and calculate usage
      const userUsageMap = new Map<
        string,
        { totalBytes: number; fileCount: number }
      >();

      allFiles.forEach((file: any) => {
        if (file.status === "error") return; // Skip error files

        const current = userUsageMap.get(file.username) || {
          totalBytes: 0,
          fileCount: 0,
        };
        current.totalBytes += file.file_size || 0;
        current.fileCount += 1;
        userUsageMap.set(file.username, current);
      });

      return Array.from(userUsageMap.entries()).map(([username, usage]) => {
        // Check if user is admin by looking for admin key usage in recent auth
        // This is a simplified approach - in production you might want a separate admin table
        const isAdmin = false; // Default to false for now

        const totalBytes = usage.totalBytes;
        const fileCount = usage.fileCount;
        const limitBytes = isAdmin ? Infinity : this.STORAGE_LIMIT_BYTES;
        const remainingBytes = isAdmin
          ? Infinity
          : Math.max(0, limitBytes - totalBytes);
        const usagePercentage = isAdmin ? 0 : (totalBytes / limitBytes) * 100;

        return {
          username,
          totalBytes,
          fileCount,
          isAdmin,
          limitBytes,
          remainingBytes,
          usagePercentage,
        };
      });
    } catch (error) {
      console.error(
        "[LibraryService] Error getting all users storage usage:",
        error
      );
      throw new Error("Failed to get all users storage usage");
    }
  }

  /**
   * Delete a file from storage and database
   */
  async deleteFile(
    fileKey: string,
    username: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(
        `[LibraryService] Deleting file: ${fileKey} for user: ${username}`
      );

      const fileDAO = getDAOFactory(this.env).fileDAO;

      // Delete the file using the DAO (this handles database, R2, and vector cleanup)
      await fileDAO.deleteFile(fileKey, this.env.FILE_BUCKET as any);

      console.log(`[LibraryService] Successfully deleted file: ${fileKey}`);
      return { success: true };
    } catch (error) {
      console.error(`[LibraryService] Error deleting file ${fileKey}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Process an uploaded file with comprehensive error handling
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
      const result = await ragService.processFileFromR2(
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
    status: string,
    _errorMessage?: string
  ): Promise<void> {
    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;
      await fileDAO.updateFileRecord(fileKey, status);

      console.log(
        `[LibraryService] Updated file status: ${fileKey} -> ${status}`
      );
    } catch (error) {
      console.error(`[LibraryService] Error updating status:`, error);
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
      const fileDAO = getDAOFactory(this.env).fileDAO;
      const result = await fileDAO.getFileForRag(fileKey, username);

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
        status: result.status as string,
        createdAt: result.created_at as string,
        updatedAt: result.updated_at as string,
      };
    } catch (error) {
      console.error(`[LibraryService] Error getting file metadata:`, error);
      return null;
    }
  }

  /**
   * Categorize and format errors for consistent handling
   */
  private categorizeError(error: Error): { message: string; details: string } {
    const errorMessage = error.message;
    let message = "File processing failed";
    let details = errorMessage;

    if (errorMessage.includes("Unavailable content in PDF document")) {
      message = "Unavailable content in PDF document";
      details =
        "The PDF file could not be parsed. It may be encrypted, corrupted, or contain no readable text.";
    } else if (errorMessage.includes("timeout")) {
      message = "File processing timeout";
      details = "The file processing took too long and was cancelled.";
    } else if (errorMessage.includes("not found in R2")) {
      message = "File not found in storage";
      details = "The uploaded file could not be found in storage.";
    } else if (errorMessage.includes("No OpenAI API key")) {
      message = "OpenAI API key required";
      details = "File processing requires an OpenAI API key for text analysis.";
    }

    return { message, details };
  }
}
