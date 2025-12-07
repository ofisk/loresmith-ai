/**
 * Notification type constants for the SSE notification system
 * These should be used throughout the codebase for consistency
 */
export const NOTIFICATION_TYPES = {
  // Shard-related notifications
  SHARDS_GENERATED: "shards_generated",
  SHARD_APPROVED: "shard_approved",
  SHARD_REJECTED: "shard_rejected",

  // File-related notifications
  FILE_UPLOADED: "file_uploaded",
  FILE_UPLOAD_FAILED: "file_upload_failed",
  INDEXING_STARTED: "indexing_started",
  INDEXING_COMPLETED: "indexing_completed",
  INDEXING_FAILED: "indexing_failed",
  CAMPAIGN_FILE_ADDED: "campaign_file_added",
  FILE_STATUS_UPDATED: "file_status_updated",
  METADATA_AUTO_GENERATED: "metadata_auto_generated",

  // Campaign-related notifications
  CAMPAIGN_CREATED: "campaign_created",
  CAMPAIGN_DELETED: "campaign_deleted",

  // Graph rebuild notifications
  REBUILD_STARTED: "rebuild_started",
  REBUILD_COMPLETED: "rebuild_completed",
  REBUILD_FAILED: "rebuild_failed",
  REBUILD_CANCELLED: "rebuild_cancelled",
  REBUILD_PROGRESS: "rebuild_progress",

  // System notifications
  SUCCESS: "success",
  ERROR: "error",
  CONNECTED: "connected",
  AUTHENTICATION_REQUIRED: "authentication_required",
} as const;

/**
 * Type for notification types
 */
export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
