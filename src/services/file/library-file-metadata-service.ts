import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { FileMetadata } from "@/types/upload";

/**
 * Service for managing library file metadata
 */
export class LibraryFileMetadataService {
  constructor(private env: Env) {}

  /**
   * Get file metadata by file key and username
   */
  async getFileMetadata(
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
        contentType: "application/pdf", // Default since column doesn't exist
        description: result.description as string | undefined,
        tags: JSON.parse((result.tags as string) || "[]"),
        status: result.status as string,
        createdAt: result.created_at as string,
        updatedAt: result.updated_at as string,
        vectorId: undefined, // Column doesn't exist
      };
    } catch (error) {
      console.error(
        `[LibraryFileMetadataService] Error getting file metadata:`,
        error
      );
      return null;
    }
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(
    fileId: string,
    userId: string,
    updates: Partial<FileMetadata>
  ): Promise<boolean> {
    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;

      // Get the file to find the file_key
      const file = await fileDAO.getFileForRag(fileId, userId);
      if (!file) {
        console.error(
          `[LibraryFileMetadataService] File not found for update:`,
          {
            fileId,
            userId,
          }
        );
        return false;
      }

      // Update description and tags if provided
      if (updates.description !== undefined || updates.tags !== undefined) {
        await fileDAO.updateFileMetadataForRag(
          file.file_key,
          userId,
          updates.description || file.description || "",
          updates.tags ? JSON.stringify(updates.tags) : file.tags || "[]"
        );
      }

      // Update status if provided
      if (updates.status !== undefined) {
        await fileDAO.updateFileRecord(file.file_key, updates.status);
      }

      console.log(`[LibraryFileMetadataService] Updated file metadata:`, {
        fileId,
        updates,
      });
      return true;
    } catch (error) {
      console.error(
        `[LibraryFileMetadataService] Error updating file metadata:`,
        error
      );
      return false;
    }
  }

  /**
   * Get all files for a user
   */
  async getUserFiles(username: string): Promise<any[]> {
    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;
      return await fileDAO.getFilesForRag(username);
    } catch (error) {
      console.error(
        `[LibraryFileMetadataService] Error getting user files:`,
        error
      );
      return [];
    }
  }
}
