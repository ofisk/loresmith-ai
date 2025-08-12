import type { Env } from "../middleware/auth";

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
      // Get total file size for user from database
      const result = await this.env.DB.prepare(
        `
        SELECT 
          COALESCE(SUM(file_size), 0) as totalBytes,
          COUNT(*) as fileCount
        FROM pdf_files 
        WHERE username = ? AND status != 'error'
      `
      )
        .bind(username)
        .first();

      const totalBytes = (result?.totalBytes as number) || 0;
      const fileCount = (result?.fileCount as number) || 0;

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
      const result = await this.env.DB.prepare(
        `
        SELECT 
          username,
          COALESCE(SUM(file_size), 0) as totalBytes,
          COUNT(*) as fileCount
        FROM pdf_files 
        WHERE status != 'error'
        GROUP BY username
      `
      ).all();

      const users = (result.results as any[]) || [];

      return await Promise.all(
        users.map(async (user) => {
          // Check if user is admin by looking for admin key usage in recent auth
          // This is a simplified approach - in production you might want a separate admin table
          const isAdmin = false; // Default to false for now

          const totalBytes = (user.totalBytes as number) || 0;
          const fileCount = (user.fileCount as number) || 0;
          const limitBytes = isAdmin ? Infinity : this.STORAGE_LIMIT_BYTES;
          const remainingBytes = isAdmin
            ? Infinity
            : Math.max(0, limitBytes - totalBytes);
          const usagePercentage = isAdmin ? 0 : (totalBytes / limitBytes) * 100;

          return {
            username: user.username,
            totalBytes,
            fileCount,
            isAdmin,
            limitBytes,
            remainingBytes,
            usagePercentage,
          };
        })
      );
    } catch (error) {
      console.error(
        "[StorageService] Error getting all users storage usage:",
        error
      );
      throw new Error("Failed to get all users storage usage");
    }
  }
}
