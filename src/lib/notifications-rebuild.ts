import { NOTIFICATION_TYPES } from "../constants/notification-types";
import type { Env } from "../middleware/auth";
import { getDAOFactory } from "../dao/dao-factory";
import { notifyUser } from "./notifications";
import type { RebuildStatus, RebuildType } from "../dao/rebuild-status-dao";

/**
 * Get username from campaignId for sending notifications
 */
async function getCampaignUsername(
  env: Env,
  campaignId: string
): Promise<string | null> {
  try {
    const daoFactory = getDAOFactory(env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    return campaign?.username || null;
  } catch (error) {
    console.error(
      `[notifyRebuildStatus] Failed to get username for campaign ${campaignId}:`,
      error
    );
    return null;
  }
}

/**
 * Get campaign name for notifications
 */
async function getCampaignName(
  env: Env,
  campaignId: string
): Promise<string | null> {
  try {
    const daoFactory = getDAOFactory(env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    return campaign?.name || null;
  } catch (error) {
    console.error(
      `[notifyRebuildStatus] Failed to get campaign name for ${campaignId}:`,
      error
    );
    return null;
  }
}

/**
 * Notify about rebuild status changes
 */
export async function notifyRebuildStatus(
  env: Env,
  campaignId: string,
  rebuildStatus: RebuildStatus,
  message?: string
): Promise<void> {
  const username = await getCampaignUsername(env, campaignId);
  if (!username) {
    console.warn(
      `[notifyRebuildStatus] Cannot send notification - no username found for campaign ${campaignId}`
    );
    return;
  }

  const campaignName = await getCampaignName(env, campaignId);
  const rebuildTypeText =
    rebuildStatus.rebuildType === "full" ? "full" : "partial";

  let notificationType: string;
  let title: string;
  let notificationMessage: string;

  switch (rebuildStatus.status) {
    case "pending":
      notificationType = NOTIFICATION_TYPES.REBUILD_STARTED;
      title = "Rebuild Queued";
      notificationMessage =
        message ||
        `🔄 ${rebuildTypeText} graph rebuild queued for "${campaignName || campaignId}"`;
      break;
    case "in_progress":
      notificationType = NOTIFICATION_TYPES.REBUILD_PROGRESS;
      title = "Rebuild In Progress";
      notificationMessage =
        message ||
        `⏳ ${rebuildTypeText} graph rebuild in progress for "${campaignName || campaignId}"`;
      break;
    case "completed": {
      notificationType = NOTIFICATION_TYPES.REBUILD_COMPLETED;
      title = "Rebuild Completed";
      const communitiesCount =
        (rebuildStatus.metadata as any)?.communitiesCount || 0;
      notificationMessage =
        message ||
        `✅ ${rebuildTypeText} graph rebuild completed for "${campaignName || campaignId}" (${communitiesCount} communities)`;
      break;
    }
    case "failed":
      notificationType = NOTIFICATION_TYPES.REBUILD_FAILED;
      title = "Rebuild Failed";
      notificationMessage =
        message ||
        `❌ ${rebuildTypeText} graph rebuild failed for "${campaignName || campaignId}": ${rebuildStatus.errorMessage || "Unknown error"}`;
      break;
    case "cancelled":
      notificationType = NOTIFICATION_TYPES.REBUILD_CANCELLED;
      title = "Rebuild Cancelled";
      notificationMessage =
        message ||
        `🚫 ${rebuildTypeText} graph rebuild cancelled for "${campaignName || campaignId}"`;
      break;
    default:
      console.warn(
        `[notifyRebuildStatus] Unknown rebuild status: ${rebuildStatus.status}`
      );
      return;
  }

  try {
    await notifyUser(env, username, {
      type: notificationType,
      title,
      message: notificationMessage,
      data: {
        campaignId,
        campaignName,
        rebuildId: rebuildStatus.id,
        rebuildType: rebuildStatus.rebuildType,
        status: rebuildStatus.status,
        ...(rebuildStatus.errorMessage && {
          errorMessage: rebuildStatus.errorMessage,
        }),
        ...(rebuildStatus.metadata && { metadata: rebuildStatus.metadata }),
      },
    });
  } catch (error) {
    console.error(`[notifyRebuildStatus] Failed to send notification:`, error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Notify about rebuild progress with custom message
 */
export async function notifyRebuildProgress(
  env: Env,
  campaignId: string,
  rebuildId: string,
  rebuildType: RebuildType,
  progress: number,
  step?: string
): Promise<void> {
  const username = await getCampaignUsername(env, campaignId);
  if (!username) {
    return;
  }

  const campaignName = await getCampaignName(env, campaignId);

  try {
    await notifyUser(env, username, {
      type: NOTIFICATION_TYPES.REBUILD_PROGRESS,
      title: "Rebuild Progress",
      message: step
        ? `⏳ ${step} (${progress}%)`
        : `⏳ Rebuild in progress (${progress}%)`,
      data: {
        campaignId,
        campaignName,
        rebuildId,
        rebuildType,
        progress,
        ...(step && { step }),
      },
    });
  } catch (error) {
    console.error(
      `[notifyRebuildProgress] Failed to send notification:`,
      error
    );
  }
}
