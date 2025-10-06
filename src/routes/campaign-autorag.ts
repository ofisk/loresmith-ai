import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { CampaignAutoRAG } from "../services/campaign-autorag-service";
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
    const resourceId = c.req.query("resourceId");

    console.log(`[Server] Getting staged shards for campaign: ${campaignId}`);

    // Verify campaign belongs to user
    const campaignDAO1 = getDAOFactory(c.env).campaignDAO;
    const campaign1 = await campaignDAO1.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign1) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    // New: read from R2 staging so client can manage per-resource files, but also
    // fallback to D1 for legacy rows (both merged in response)

    const basePath =
      campaign1?.campaignRagBasePath || `campaigns/${campaignId}`;
    const autoRAG = new CampaignAutoRAG(
      c.env,
      c.env.AUTORAG_BASE_URL,
      basePath
    );
    const r2Staged = await autoRAG.listStagedCandidates();
    const r2Filtered = resourceId
      ? r2Staged.filter((x) => x.resourceId === resourceId)
      : r2Staged;

    console.log(
      `[Server] R2 staged: ${r2Filtered.length} for campaign ${campaignId}`,
      JSON.stringify(r2Filtered, null, 2)
    );

    // Group shards by their key (staging key) to match StagedShardGroup interface
    const groupedShards = new Map<
      string,
      {
        key: string;
        sourceRef: any;
        shards: any[];
        created_at: string;
        campaignRagBasePath: string;
      }
    >();

    for (const item of r2Filtered) {
      if (!groupedShards.has(item.key)) {
        groupedShards.set(item.key, {
          key: item.key,
          sourceRef: item.shard.sourceRef,
          shards: [],
          created_at: new Date().toISOString(), // Default to now since we don't have this info
          campaignRagBasePath: basePath,
        });
      }
      groupedShards.get(item.key)!.shards.push(item.shard);
    }

    const stagedShardGroups = Array.from(groupedShards.values());

    console.log(
      `[Server] Grouped into ${stagedShardGroups.length} shard groups`,
      JSON.stringify(stagedShardGroups, null, 2)
    );

    // Return the grouped shards in the expected format
    return c.json({ shards: stagedShardGroups });
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
    const { shardIds, stagingKeys } = await c.req.json();

    if (!shardIds || !Array.isArray(shardIds) || shardIds.length === 0) {
      return c.json({ error: "shardIds array is required" }, 400);
    }

    console.log(
      `[Server] Approving ${shardIds.length} shards for campaign: ${campaignId}`
    );

    // Verify campaign belongs to user
    const campaignDAOa = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAOa.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    // Move R2 staging objects to approved. If stagingKeys are provided, prefer those.
    const basePath = campaign.campaignRagBasePath || `campaigns/${campaignId}`;
    const autoRAG = new CampaignAutoRAG(
      c.env,
      c.env.AUTORAG_BASE_URL,
      basePath
    );
    if (Array.isArray(stagingKeys) && stagingKeys.length > 0) {
      for (const key of stagingKeys) {
        await autoRAG.approveShards(key);
      }
    }

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

    return c.json({
      success: true,
      approvedCount: Array.isArray(stagingKeys)
        ? stagingKeys.length
        : shardIds.length,
    });
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
    const { shardIds, reason, stagingKeys } = await c.req.json();

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

    const basePath = campaign?.campaignRagBasePath || `campaigns/${campaignId}`;
    const autoRAG = new CampaignAutoRAG(
      c.env,
      c.env.AUTORAG_BASE_URL,
      basePath
    );
    if (Array.isArray(stagingKeys) && stagingKeys.length > 0) {
      for (const key of stagingKeys) {
        await autoRAG.rejectShards(key, reason);
      }
    }

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

    return c.json({
      success: true,
      rejectedCount: Array.isArray(stagingKeys)
        ? stagingKeys.length
        : shardIds.length,
    });
  } catch (error) {
    console.error("[Server] Error rejecting shards:", error);
    return c.json({ error: "Failed to reject shards" }, 500);
  }
}
