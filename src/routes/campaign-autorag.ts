import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { SHARD_STATUSES } from "../lib/content-types";
import {
  notifyShardApproval,
  notifyShardRejection,
} from "../lib/notifications";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Get staged shards for a campaign
export async function handleGetStagedShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;

    console.log(`[Server] Getting staged shards for campaign: ${campaignId}`);

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const stagedShardsDAO = getDAOFactory(c.env).stagedShardsDAO;
    const stagedShards =
      await stagedShardsDAO.getStagedShardsByCampaign(campaignId);

    console.log(
      `[Server] Found ${stagedShards.length} staged shards for campaign: ${campaignId}`
    );

    return c.json({ shards: stagedShards });
  } catch (error) {
    console.error("[Server] Error getting staged shards:", error);
    return c.json({ error: "Failed to get staged shards" }, 500);
  }
}

// Approve shards for a campaign
export async function handleApproveShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { shardIds } = await c.req.json();

    if (!shardIds || !Array.isArray(shardIds) || shardIds.length === 0) {
      return c.json({ error: "shardIds array is required" }, 400);
    }

    console.log(
      `[Server] Approving ${shardIds.length} shards for campaign: ${campaignId}`
    );

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const stagedShardsDAO = getDAOFactory(c.env).stagedShardsDAO;

    // Bulk update shards to approved status
    await stagedShardsDAO.bulkUpdateShardStatuses(
      shardIds,
      SHARD_STATUSES.APPROVED
    );

    console.log(
      `[Server] Approved ${shardIds.length} shards for campaign: ${campaignId}`
    );

    // Send notification about shard approval
    try {
      await notifyShardApproval(
        c.env,
        userAuth.username,
        campaign.name,
        shardIds.length
      );
    } catch (error) {
      console.error(
        "[Server] Failed to send shard approval notification:",
        error
      );
    }

    return c.json({ success: true, approvedCount: shardIds.length });
  } catch (error) {
    console.error("[Server] Error approving shards:", error);
    return c.json({ error: "Failed to approve shards" }, 500);
  }
}

// Reject shards for a campaign
export async function handleRejectShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { shardIds, reason } = await c.req.json();

    if (!shardIds || !Array.isArray(shardIds) || shardIds.length === 0) {
      return c.json({ error: "shardIds array is required" }, 400);
    }

    if (!reason) {
      return c.json({ error: "reason is required" }, 400);
    }

    console.log(
      `[Server] Rejecting ${shardIds.length} shards for campaign: ${campaignId}, reason: ${reason}`
    );

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const stagedShardsDAO = getDAOFactory(c.env).stagedShardsDAO;

    // Bulk update shards to rejected status
    await stagedShardsDAO.bulkUpdateShardStatuses(
      shardIds,
      SHARD_STATUSES.REJECTED
    );

    console.log(
      `[Server] Rejected ${shardIds.length} shards for campaign: ${campaignId}`
    );

    // Send notification about shard rejection
    try {
      await notifyShardRejection(
        c.env,
        userAuth.username,
        campaign.name,
        shardIds.length,
        reason
      );
    } catch (error) {
      console.error(
        "[Server] Failed to send shard rejection notification:",
        error
      );
    }

    return c.json({ success: true, rejectedCount: shardIds.length });
  } catch (error) {
    console.error("[Server] Error rejecting shards:", error);
    return c.json({ error: "Failed to reject shards" }, 500);
  }
}

// Search approved shards for a campaign
export async function handleSearchApprovedShards(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { query } = await c.req.json();

    if (!query) {
      return c.json({ error: "query parameter is required" }, 400);
    }

    console.log(
      `[Server] Searching approved shards for campaign: ${campaignId}, query: ${query}`
    );

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const stagedShardsDAO = getDAOFactory(c.env).stagedShardsDAO;
    const searchResults = await stagedShardsDAO.searchApprovedShards(
      campaignId,
      query
    );

    console.log(
      `[Server] Found ${searchResults.length} search results for campaign: ${campaignId}`
    );

    return c.json({ results: searchResults });
  } catch (error) {
    console.error("[Server] Error searching approved shards:", error);
    return c.json({ error: "Failed to search shards" }, 500);
  }
}
