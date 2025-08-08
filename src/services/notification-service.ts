export interface UserNotification {
  id: string;
  username: string;
  notification_type: "file_processing_complete" | "file_processing_error";
  title: string;
  message: string;
  file_key?: string;
  file_name?: string;
  metadata?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface CreateNotificationData {
  username: string;
  notification_type: "file_processing_complete" | "file_processing_error";
  title: string;
  message: string;
  file_key?: string;
  file_name?: string;
  metadata?: Record<string, any>;
}

// Minimal interface for what NotificationService needs
interface NotificationEnv {
  DB: D1Database;
}

export class NotificationService {
  constructor(private env: NotificationEnv) {}

  /**
   * Create a new notification for a user
   */
  async createNotification(data: CreateNotificationData): Promise<string> {
    const notificationId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      `INSERT INTO user_notifications 
       (id, username, notification_type, title, message, file_key, file_name, metadata, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        notificationId,
        data.username,
        data.notification_type,
        data.title,
        data.message,
        data.file_key || null,
        data.file_name || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        now
      )
      .run();

    console.log(
      `[NotificationService] Created notification ${notificationId} for user ${data.username}: ${data.title}`
    );

    return notificationId;
  }

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(username: string): Promise<UserNotification[]> {
    const result = await this.env.DB.prepare(
      `SELECT * FROM user_notifications 
       WHERE username = ? AND is_read = FALSE 
       ORDER BY created_at DESC`
    )
      .bind(username)
      .all<UserNotification>();

    return result.results || [];
  }

  /**
   * Get all notifications for a user (with pagination)
   */
  async getUserNotifications(
    username: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    notifications: UserNotification[];
    total: number;
    hasMore: boolean;
  }> {
    // Get total count
    const countResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as total FROM user_notifications WHERE username = ?`
    )
      .bind(username)
      .first<{ total: number }>();

    const total = countResult?.total || 0;

    // Get notifications with pagination
    const result = await this.env.DB.prepare(
      `SELECT * FROM user_notifications 
       WHERE username = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`
    )
      .bind(username, limit, offset)
      .all<UserNotification>();

    const notifications = result.results || [];
    const hasMore = offset + notifications.length < total;

    return {
      notifications,
      total,
      hasMore,
    };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, username: string): Promise<boolean> {
    const now = new Date().toISOString();

    const result = await this.env.DB.prepare(
      `UPDATE user_notifications 
       SET is_read = TRUE, read_at = ? 
       WHERE id = ? AND username = ?`
    )
      .bind(now, notificationId, username)
      .run();

    return (result.meta?.changes || 0) > 0;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(username: string): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.env.DB.prepare(
      `UPDATE user_notifications 
       SET is_read = TRUE, read_at = ? 
       WHERE username = ? AND is_read = FALSE`
    )
      .bind(now, username)
      .run();

    return result.meta?.changes || 0;
  }

  /**
   * Delete old notifications (cleanup)
   */
  async cleanupOldNotifications(
    daysOld: number = 30
  ): Promise<{ deleted: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffString = cutoffDate.toISOString();

    const result = await this.env.DB.prepare(
      `DELETE FROM user_notifications 
       WHERE created_at < ? AND is_read = TRUE`
    )
      .bind(cutoffString)
      .run();

    const deletedCount = result.meta?.changes || 0;
    console.log(
      `[NotificationService] Cleaned up ${deletedCount} old notifications`
    );

    return { deleted: deletedCount };
  }

  /**
   * Helper method to create file processing completion notification
   */
  async notifyFileProcessingComplete(
    username: string,
    fileName: string,
    fileKey: string
  ): Promise<string> {
    return this.createNotification({
      username,
      notification_type: "file_processing_complete",
      title: "File Processing Complete",
      message: `Your file "${fileName}" has been successfully processed and is ready for use in your campaigns.`,
      file_key: fileKey,
      file_name: fileName,
    });
  }

  /**
   * Helper method to create file processing error notification
   */
  async notifyFileProcessingError(
    username: string,
    fileName: string,
    fileKey: string,
    error: string
  ): Promise<string> {
    return this.createNotification({
      username,
      notification_type: "file_processing_error",
      title: "File Processing Failed",
      message: `Your file "${fileName}" could not be processed: ${error}`,
      file_key: fileKey,
      file_name: fileName,
      metadata: { error },
    });
  }
}
