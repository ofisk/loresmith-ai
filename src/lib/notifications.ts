import { NOTIFICATION_TYPES } from "../constants/notification-types";
import type { NotificationPayload } from "../durable-objects/notification-hub";
import type { Env } from "../middleware/auth";

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

    // Call the Durable Object directly instead of making an HTTP request
    const response = await notificationHub.fetch(
      new Request("http://localhost/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(completePayload),
      })
    );

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
  const isNone = !shardCount || shardCount === 0;
  const title = isNone ? "No Shards Found" : "New Shards Ready!";
  const message = isNone
    ? `🔎 No shards were discovered from "${fileName}" in "${campaignName}".`
    : `🎉 ${shardCount} new shards generated from "${fileName}" in "${campaignName}"!`;

  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.SHARDS_GENERATED,
    title,
    message,
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
  console.log(
    "[notifyFileUploadComplete] Sending notification for:",
    fileName,
    "to user:",
    userId
  );
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.FILE_UPLOADED,
    title: "File Upload Complete",
    message: `✅ "${fileName}" has been uploaded successfully (${formatFileSize(fileSize)})`,
    data: {
      fileName,
      fileSize,
    },
  });
  console.log("[notifyFileUploadComplete] Notification sent successfully");
}

/**
 * Publish a file upload failure notification
 */
export async function notifyFileUploadFailed(
  env: Env,
  userId: string,
  fileName: string,
  reason?: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.FILE_UPLOAD_FAILED,
    title: "Upload Faltered",
    message: `⚠️ The scroll "${fileName}" could not be stowed. ${reason ? `Reason: ${reason}` : "Please try again."}`,
    data: {
      fileName,
      reason,
    },
  });
}

/**
 * Publish indexing lifecycle notifications
 */
export async function notifyIndexingStarted(
  env: Env,
  userId: string,
  fileName: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.INDEXING_STARTED,
    title: "Indexing Begun",
    message: `📜 We’re scribing "${fileName}" into your library.`,
    data: { fileName },
  });
}

export async function notifyIndexingCompleted(
  env: Env,
  userId: string,
  fileName: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.INDEXING_COMPLETED,
    title: "Indexing Complete",
    message: `✨ "${fileName}" is now searchable in your tome.`,
    data: { fileName },
  });
}

export async function notifyIndexingFailed(
  env: Env,
  userId: string,
  fileName: string,
  reason?: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.INDEXING_FAILED,
    title: "Indexing Failed",
    message: `🛑 Our quill slipped while indexing "${fileName}". ${reason ? `Reason: ${reason}` : "Please try again later."}`,
    data: { fileName, reason },
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
 * Publish a shard parsing issue notification
 */
export async function notifyShardParseIssue(
  env: Env,
  userId: string,
  campaignName: string,
  fileName: string,
  details: Record<string, any>
): Promise<void> {
  await notifyUser(env, userId, {
    type: "system:shard_parse_issue",
    title: "Shard Parsing Returned No Results",
    message: `No shards could be parsed from "${fileName}".`,
    data: { campaignName, fileName, details, hidden: true },
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
