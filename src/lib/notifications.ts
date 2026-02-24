import { NOTIFICATION_TYPES } from "../constants/notification-types";
import { getDAOFactory } from "../dao/dao-factory";
import type { NotificationPayload } from "../durable-objects/notification-hub";
import type { Env } from "../middleware/auth";
import { createLogger } from "@/lib/logger";

/**
 * Publish a notification to a specific user
 */
export async function notifyUser(
  env: Env,
  userId: string,
  payload: Omit<NotificationPayload, "timestamp">
): Promise<void> {
  const logger = createLogger(
    env as unknown as Record<string, unknown>,
    "[notifyUser]"
  );
  logger.debug(`Sending notification to user: ${userId}`);

  try {
    // Get NotificationHub Durable Object for the user
    const notificationHubId = env.NOTIFICATIONS.idFromName(`user-${userId}`);
    logger.trace(`Notification hub ID: ${notificationHubId.toString()}`);

    const notificationHub = env.NOTIFICATIONS.get(notificationHubId);
    logger.trace("Notification hub instance acquired:", !!notificationHub);

    // Create complete payload with timestamp
    const completePayload: NotificationPayload = {
      ...payload,
      timestamp: Date.now(),
    };
    logger.trace("Calling notification hub publish");

    // Add a timeout to the fetch call
    // Increased timeout to 10 seconds to handle cases where DO is busy delivering queued notifications
    const fetchPromise = notificationHub.fetch(
      new Request("http://localhost/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(completePayload),
      })
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Durable Object fetch timeout")), 10000)
    );

    const response = (await Promise.race([
      fetchPromise,
      timeoutPromise,
    ])) as Response;
    logger.trace(
      "Notification hub response:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      logger.warn(
        `Failed to send notification to ${userId}: ${response.status} ${response.statusText}`
      );
    } else {
      logger.debug(`Notification sent successfully to ${userId}`);
    }
  } catch (error) {
    logger.error(`Error sending notification to ${userId}:`, error);
    throw error; // Re-throw to see the error in the calling function
  }
}

/**
 * Publish an entity generation notification
 * This function name is kept for UI compatibility
 */
export async function notifyShardGeneration(
  env: Env,
  userId: string,
  campaignName: string,
  fileName: string,
  shardCount: number,
  context?: {
    campaignId: string;
    resourceId: string;
    groups?: any[];
    chunkNumber?: number;
    errorMessage?: string;
  }
): Promise<void> {
  const isNone = !shardCount || shardCount === 0;
  const isStreaming = context?.chunkNumber !== undefined;

  let title: string;
  let message: string;

  if (isNone) {
    title = "No shards found";
    message = `🔎 No shards were discovered from "${fileName}" in "${campaignName}".`;
    // Include error message if provided (e.g., all chunks failed)
    if (context?.errorMessage) {
      message += ` ${context.errorMessage}`;
    }
  } else if (isStreaming) {
    title = "Shards discovered";
    message = `📦 ${shardCount} shards found from "${fileName}" in "${campaignName}".`;
  } else {
    title = "New shards ready";
    message = `🎉 ${shardCount} new shards generated from "${fileName}" in "${campaignName}"!`;
    // Include warning if there were partial failures
    if (context?.errorMessage) {
      message += ` ${context.errorMessage}`;
    }
  }

  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.SHARDS_GENERATED,
    title,
    message,
    data: {
      campaignName,
      fileName,
      shardCount,
      // Provide optional decoupled UI hint (no component names)
      ...(context
        ? {
            ui_hint: {
              type: "shards_ready",
              data: {
                campaignId: context.campaignId,
                resourceId: context.resourceId,
                groups: context.groups,
              },
            },
          }
        : {}),
    },
  });
}

/**
 * Publish a file upload completion notification with complete file data
 * This allows UI components to update in place without refetching
 */
export async function notifyFileUploadCompleteWithData(
  env: Env,
  userId: string,
  fileData: {
    id: string;
    file_key: string;
    file_name: string;
    file_size: number;
    description?: string;
    tags?: string[];
    status: string;
    created_at: string;
    updated_at: string;
  }
): Promise<void> {
  const logger = createLogger(
    env as unknown as Record<string, unknown>,
    "[notifyFileUploadCompleteWithData]"
  );
  logger.debug(
    `Sending upload complete notification: ${fileData.file_name} -> ${userId}`
  );
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.FILE_UPLOADED,
    title: "File Upload Complete",
    message: `✅ "${fileData.file_name}" has been uploaded successfully (${formatFileSize(fileData.file_size)})`,
    data: {
      // Include complete file data for in-place updates
      completeFileData: fileData,
      // Also include individual fields for backward compatibility
      fileName: fileData.file_name,
      fileSize: fileData.file_size,
      // Mark as hidden to prevent showing in notifications hub
      hidden: true,
    },
  });
  logger.trace("Notification sent successfully");
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
    message: `⚠️ The scroll "${fileName}" could not be stowed. Please try again.`,
    data: {
      fileName,
      // Store reason in data for debugging but don't display it
      ...(reason && { reason }),
    },
  });
}

/**
 * Notify when next steps (planning tasks) are created by the application
 */
export async function notifyNextStepsCreated(
  env: Env,
  userId: string,
  campaignName: string,
  count: number
): Promise<void> {
  try {
    await notifyUser(env, userId, {
      type: NOTIFICATION_TYPES.NEXT_STEPS_CREATED,
      title: "Next steps added",
      message:
        count === 1
          ? `A next step was added for "${campaignName}". View it in Campaign Details > Next steps.`
          : `${count} next steps were added for "${campaignName}". View them in Campaign Details > Next steps.`,
      data: { campaignName, count },
    });
  } catch (error) {
    console.error(
      "[notifyNextStepsCreated] Failed to send notification:",
      error
    );
    // Don't throw - notifications are non-critical
  }
}

/**
 * Publish indexing lifecycle notifications
 */
export async function notifyIndexingStarted(
  env: Env,
  userId: string,
  fileName: string,
  fileKey?: string,
  status?: string,
  fileSize?: number
): Promise<void> {
  const logger = createLogger(
    env as unknown as Record<string, unknown>,
    "[notifyIndexingStarted]"
  );
  logger.debug(`Sending indexing started: ${fileName} -> ${userId}`);

  try {
    await notifyUser(env, userId, {
      type: NOTIFICATION_TYPES.INDEXING_STARTED,
      title: "Preparing your lore",
      message: `📜 We're adding "${fileName}" to your library.`,
      data: {
        fileName,
        ...(fileKey && { fileKey }),
        ...(status && { status }),
        ...(fileSize !== undefined && { fileSize }),
      },
    });
    logger.trace("Notification sent successfully");
  } catch (error) {
    logger.warn(
      `Failed to send indexing started for user: ${userId}, file: ${fileName}`,
      error
    );
    throw error;
  }
}

export async function notifyIndexingCompleted(
  env: Env,
  userId: string,
  fileName: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.INDEXING_COMPLETED,
    title: "Ready",
    message: `✨ "${fileName}" is ready for your campaigns.`,
    data: { fileName },
  });
}

export async function notifyIndexingFailed(
  env: Env,
  userId: string,
  fileName: string,
  reason?: string,
  fileKey?: string,
  fileSize?: number
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.INDEXING_FAILED,
    title: "Couldn't prepare file",
    message: `🛑 Our quill slipped while preparing "${fileName}". Please try again later.`,
    data: {
      fileName,
      ...(fileKey && { fileKey }),
      ...(fileSize !== undefined && { fileSize }),
      // Store reason in data for debugging but don't display it
      ...(reason && { reason }),
    },
  });
}

/**
 * Publish a campaign creation notification
 */
export async function notifyCampaignCreated(
  env: Env,
  userId: string,
  campaignName: string,
  campaignDescription?: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.CAMPAIGN_CREATED,
    title: "Campaign Created",
    message: `🎯 Your campaign "${campaignName}" has been created successfully!`,
    data: {
      campaignName,
      campaignDescription: campaignDescription || "",
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
 * Publish an entity approval notification
 * This function name is kept for UI compatibility
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
 * Publish a proposal approved notification (to proposal creator)
 */
export async function notifyProposalApproved(
  env: Env,
  proposedByUsername: string,
  campaignName: string,
  fileName: string
): Promise<void> {
  try {
    await notifyUser(env, proposedByUsername, {
      type: NOTIFICATION_TYPES.PROPOSAL_APPROVED,
      title: "Proposal accepted",
      message: `✅ Your proposed file "${fileName}" was accepted and added to "${campaignName}".`,
      data: { campaignName, fileName },
    });
  } catch (e) {
    console.error("[notifyProposalApproved] Failed:", e);
  }
}

/**
 * Publish a proposal rejected notification (to proposal creator)
 */
export async function notifyProposalRejected(
  env: Env,
  proposedByUsername: string,
  campaignName: string,
  fileName: string
): Promise<void> {
  try {
    await notifyUser(env, proposedByUsername, {
      type: NOTIFICATION_TYPES.PROPOSAL_REJECTED,
      title: "Proposal declined",
      message: `❌ Your proposed file "${fileName}" was declined for "${campaignName}".`,
      data: { campaignName, fileName },
    });
  } catch (e) {
    console.error("[notifyProposalRejected] Failed:", e);
  }
}

/**
 * Notify all campaign members (owner + invited members).
 * Skips usernames in excludeUsernames (e.g. the actor who triggered the action).
 */
export async function notifyCampaignMembers(
  env: Env,
  campaignId: string,
  campaignName: string,
  buildPayload: (username: string) => Omit<NotificationPayload, "timestamp">,
  excludeUsernames: string[] = []
): Promise<void> {
  const daoFactory = getDAOFactory(env);
  const usernames =
    await daoFactory.campaignDAO.getCampaignMemberUsernames(campaignId);
  const exclude = new Set(excludeUsernames);
  const toNotify = usernames.filter((u) => !exclude.has(u));
  await Promise.allSettled(
    toNotify.map((username) =>
      notifyUser(env, username, buildPayload(username))
    )
  );
}

/**
 * Publish an entity rejection notification
 * This function name is kept for UI compatibility
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
 * Publish an entity parsing issue notification
 * This function name is kept for UI compatibility
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
    // Respect caller preference for visibility; default to hidden
    data: { campaignName, fileName, details, hidden: details?.hidden ?? true },
  });
}

/**
 * Notification visibility options
 */
export type NotificationVisibility = "user-facing" | "status-only" | "both";

/**
 * Unified function to notify about file indexing status changes
 * Can send user-facing notifications, status-only updates, or both
 */
export async function notifyFileIndexingStatus(
  env: Env,
  userId: string,
  fileKey: string,
  fileName: string,
  status: string,
  options: {
    visibility?: NotificationVisibility;
    fileSize?: number;
    userMessage?: string; // Custom message for user-facing notifications
    statusMessage?: string; // Custom message for status notifications
    reason?: string; // Error reason for failed statuses
  } = {}
): Promise<void> {
  const {
    visibility = "both",
    fileSize,
    userMessage,
    statusMessage,
    reason,
  } = options;

  const notifications: Promise<void>[] = [];

  // Send user-facing notification
  if (visibility === "user-facing" || visibility === "both") {
    const isError = status === "error" || status === "failed";
    let message = userMessage;
    if (!message) {
      if (status === "syncing" || status === "uploaded") {
        message = `📜 We're scribing "${fileName}" into your library.`;
      } else if (isError) {
        message = `🛑 Our quill slipped while indexing "${fileName}". Please try again later.`;
      } else {
        message = `📄 "${fileName}" status updated to ${status}`;
      }
    }
    notifications.push(
      notifyUser(env, userId, {
        type: isError
          ? NOTIFICATION_TYPES.INDEXING_FAILED
          : NOTIFICATION_TYPES.INDEXING_STARTED,
        title: isError ? "Indexing Failed" : "Indexing Begun",
        message,
        data: {
          fileName,
          fileKey,
          status,
          ...(fileSize !== undefined && { fileSize }),
          ...(reason && { reason }),
        },
      })
    );
  }

  // Send status-only notification (FILE_STATUS_UPDATED type, hidden)
  if (visibility === "status-only" || visibility === "both") {
    const message =
      statusMessage || `📄 "${fileName}" status updated to ${status}`;
    notifications.push(
      notifyUser(env, userId, {
        type: NOTIFICATION_TYPES.FILE_STATUS_UPDATED,
        title: "File Status Updated",
        message,
        data: {
          fileKey,
          fileName,
          status,
          fileSize,
          // Mark as hidden to prevent showing in notifications hub
          hidden: true,
        },
      })
    );
  }

  await Promise.all(notifications);
}

/**
 * Publish a file status update notification
 */
export async function notifyFileStatusUpdated(
  env: Env,
  userId: string,
  fileKey: string,
  fileName: string,
  status: string,
  fileSize?: number
): Promise<void> {
  await notifyFileIndexingStatus(env, userId, fileKey, fileName, status, {
    visibility: "status-only",
    fileSize,
  });
}

/**
 * Publish a complete file update notification with all file data
 * This allows UI components to update in place without refetching
 */
export async function notifyFileUpdated(
  env: Env,
  userId: string,
  fileData: {
    id: string;
    file_key: string;
    file_name: string;
    file_size: number;
    description?: string;
    tags?: string[];
    status: string;
    created_at: string;
    updated_at: string;
  }
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.FILE_STATUS_UPDATED,
    title: "File Updated",
    message: `📄 "${fileData.file_name}" has been updated`,
    data: {
      // Include complete file data for in-place updates
      completeFileData: fileData,
      // Also include individual fields for backward compatibility
      fileKey: fileData.file_key,
      fileName: fileData.file_name,
      status: fileData.status,
      fileSize: fileData.file_size,
      // Mark as hidden to prevent showing in notifications hub
      hidden: true,
    },
  });
}

/**
 * Publish a notification when file metadata is auto-generated
 */
export async function notifyMetadataAutoGenerated(
  env: Env,
  userId: string,
  fileName: string,
  metadataFields: {
    displayName?: string;
    description?: string;
    tags?: string[];
  }
): Promise<void> {
  const fieldsGenerated: string[] = [];
  if (metadataFields.displayName) fieldsGenerated.push("display name");
  if (metadataFields.description) fieldsGenerated.push("description");
  if (metadataFields.tags && metadataFields.tags.length > 0)
    fieldsGenerated.push("tags");

  const fieldsText =
    fieldsGenerated.length > 0 ? fieldsGenerated.join(", ") : "metadata";

  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.METADATA_AUTO_GENERATED,
    title: "Metadata Generated",
    message: `✨ Auto-generated ${fieldsText} for "${fileName}"`,
    data: {
      fileName,
      ...metadataFields,
      hidden: true,
    },
  });
}

/**
 * Publish an authentication required notification
 */
export async function notifyAuthenticationRequired(
  env: Env,
  userId: string,
  message?: string
): Promise<void> {
  await notifyUser(env, userId, {
    type: NOTIFICATION_TYPES.AUTHENTICATION_REQUIRED,
    title: "Authentication Required",
    message:
      message || "OpenAI API key required. Please authenticate to continue.",
    data: {
      // Mark as hidden to prevent showing in notification bell
      hidden: true,
      // UI hint to trigger the authentication modal
      ui_hint: {
        type: "show_auth_modal",
        data: {},
      },
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
