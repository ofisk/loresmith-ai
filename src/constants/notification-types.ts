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
  CAMPAIGN_FILE_ADDED: "campaign_file_added",

  // Campaign-related notifications
  CAMPAIGN_CREATED: "campaign_created",

  // System notifications
  SUCCESS: "success",
  ERROR: "error",
  CONNECTED: "connected",
} as const;

/**
 * Type for notification types
 */
export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
