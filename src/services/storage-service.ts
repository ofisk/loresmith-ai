import type { Env } from "../middleware/auth";
import { getDAOFactory } from "../dao/dao-factory";

export interface StorageUsage {
  username: string;
  totalBytes: number;
  fileCount: number;
  isAdmin: boolean;
  limitBytes: number;
  remainingBytes: number;
  usagePercentage: number;
}

export class StorageService {
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
        "[StorageService] Error getting user storage usage:",
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
        "[StorageService] Error getting all users storage usage:",
        error
      );
      throw new Error("Failed to get all users storage usage");
    }
  }
}
