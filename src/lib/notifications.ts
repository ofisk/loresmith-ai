import { NOTIFICATION_TYPES } from "../constants/notification-types";
import type { NotificationPayload } from "../durable-objects/notification-hub";
import type { Env } from "../middleware/auth";
import { API_CONFIG } from "../shared";

/**
 * Publish a notification to a specific user
 */
export async function notifyUser(
  env: Env,
  userId: string,
  payload: Omit<NotificationPayload, "timestamp">
): Promise<void> {
  try {
    // Get NotificationHub Durable Object for the user
    const notificationHubId = env.NOTIFICATIONS.idFromName(`user-${userId}`);
    const notificationHub = env.NOTIFICATIONS.get(notificationHubId);

    // Create complete payload with timestamp
    const completePayload: NotificationPayload = {
      ...payload,
      timestamp: Date.now(),
    };

    // Create publish request
    const publishRequest = new Request(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.NOTIFICATIONS.PUBLISH),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(completePayload),
      }
    );

    // Send notification
    const response = await notificationHub.fetch(publishRequest);

    if (!response.ok) {
      console.error(
        `[notifyUser] Failed to send notification to ${userId}:`,
        response.status,
        response.statusText
      );
    }
  } catch (error) {
    console.error(
      `[notifyUser] Error sending notification to ${userId}:`,
      error
    );
  }
}

/**
 * Publish a shard generation notification
 */
export async function notifyShardGeneration(
  env: Env,
  userId: string,
  campaignName: string,
  fileName: string,
  shardCount: number
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.SHARDS_GENERATED,
    title: "New Shards Ready!",
    message: `🎉 ${shardCount} new shards generated from "${fileName}"! Check your "${campaignName}" campaign to review them.`,
    data: {
      campaignName,
      fileName,
      shardCount,
    },
  });
}

/**
 * Publish a file upload completion notification
 */
export async function notifyFileUploadComplete(
  env: Env,
  userId: string,
  fileName: string,
  fileSize: number
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.FILE_UPLOADED,
    title: "File Upload Complete",
    message: `✅ "${fileName}" has been uploaded successfully (${formatFileSize(fileSize)})`,
    data: {
      fileName,
      fileSize,
    },
  });
}

/**
 * Publish a campaign creation notification
 */
export async function notifyCampaignCreated(
  env: Env,
  userId: string,
  campaignName: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.CAMPAIGN_CREATED,
    title: "Campaign Created",
    message: `🎯 Your campaign "${campaignName}" has been created successfully!`,
    data: {
      campaignName,
    },
  });
}

/**
 * Publish a general success notification
 */
export async function notifySuccess(
  env: Env,
  userId: string,
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<void> {
  await notifyUser(env, userId, {
    type: "success",
    title,
    message,
    data,
  });
}

/**
 * Publish a general error notification
 */
export async function notifyError(
  env: Env,
  userId: string,
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<void> {
  await notifyUser(env, userId, {
    type: "error",
    title,
    message,
    data,
  });
}

/**
 * Publish a shard approval notification
 */
export async function notifyShardApproval(
  env: Env,
  userId: string,
  campaignName: string,
  shardCount: number
): Promise<void> {
  await notifyUser(env, userId, {
    type: "shards_approved",
    title: "Shards Approved!",
    message: `✅ ${shardCount} shards approved for "${campaignName}" campaign`,
    data: {
      campaignName,
      shardCount,
    },
  });
}

/**
 * Publish a shard rejection notification
 */
export async function notifyShardRejection(
  env: Env,
  userId: string,
  campaignName: string,
  shardCount: number,
  reason?: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: "shards_rejected",
    title: "Shards Rejected",
    message: `❌ ${shardCount} shards rejected for "${campaignName}" campaign${reason ? ` (${reason})` : ""}`,
    data: {
      campaignName,
      shardCount,
      reason,
    },
  });
}

/**
 * Publish a campaign file addition notification
 */
export async function notifyCampaignFileAdded(
  env: Env,
  userId: string,
  campaignName: string,
  fileName: string,
  shardCount?: number
): Promise<void> {
  const message = shardCount
    ? `📄 "${fileName}" added to "${campaignName}" campaign. ${shardCount} shards generated for review.`
    : `📄 "${fileName}" added to "${campaignName}" campaign.`;

  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.CAMPAIGN_FILE_ADDED,
    title: "File Added to Campaign",
    message,
    data: {
      campaignName,
      fileName,
      shardCount,
    },
  });
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
