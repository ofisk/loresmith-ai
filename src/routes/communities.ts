import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { CommunityDetectionService } from "@/services/graph/community-detection-service";
import type { CommunityHierarchy } from "@/services/graph/community-detection-service";
import type { Community } from "@/dao/community-dao";
import {
  buildCommunityHierarchyTree,
  calculateCommunityStats,
} from "@/lib/graph/community-utils";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

/**
 * POST /api/campaigns/:campaignId/communities/detect
 * Trigger community detection for a campaign
 */
export async function handleDetectCommunities(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    if (!campaignId) {
      return c.json({ error: "Campaign ID required" }, 400);
    }

    // Verify campaign ownership
    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    // Parse options from request body
    const body = await c.req.json().catch(() => ({}));
    const options = {
      resolution: body.resolution,
      minCommunitySize: body.minCommunitySize,
      maxLevels: body.maxLevels,
      maxIterations: body.maxIterations,
      minImprovement: body.minImprovement,
    };

    // Create service
    const communityDetectionService = new CommunityDetectionService(
      daoFactory.entityDAO,
      daoFactory.communityDAO
    );

    // Detect communities (multi-level if maxLevels > 1)
    const useMultiLevel = options.maxLevels && options.maxLevels > 1;
    let communities: Community[];

    if (useMultiLevel) {
      const hierarchies =
        await communityDetectionService.detectMultiLevelCommunities(
          campaignId,
          options
        );
      // Flatten hierarchies to get all communities
      const allCommunities: Community[] = [];
      function collectCommunities(hierarchy: CommunityHierarchy) {
        allCommunities.push(hierarchy.community);
        for (const child of hierarchy.children) {
          collectCommunities(child);
        }
      }
      for (const hierarchy of hierarchies) {
        collectCommunities(hierarchy);
      }
      communities = allCommunities;
    } else {
      communities = await communityDetectionService.detectCommunities(
        campaignId,
        options
      );
    }

    return c.json({
      success: true,
      communities,
      count: communities.length,
      stats: calculateCommunityStats(communities),
    });
  } catch (error) {
    console.error("[Communities] Error detecting communities:", error);
    return c.json(
      {
        error: "Failed to detect communities",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/communities
 * List all communities for a campaign
 */
export async function handleListCommunities(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    if (!campaignId) {
      return c.json({ error: "Campaign ID required" }, 400);
    }

    // Verify campaign ownership
    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    // Parse query parameters
    const level = c.req.query("level");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    const options: {
      level?: number;
      limit?: number;
      offset?: number;
    } = {};

    if (level) {
      options.level = parseInt(level, 10);
    }
    if (limit) {
      options.limit = parseInt(limit, 10);
    }
    if (offset) {
      options.offset = parseInt(offset, 10);
    }

    const communities = await daoFactory.communityDAO.listCommunitiesByCampaign(
      campaignId,
      options
    );

    return c.json({
      success: true,
      communities,
      count: communities.length,
      stats: calculateCommunityStats(communities),
    });
  } catch (error) {
    console.error("[Communities] Error listing communities:", error);
    return c.json(
      {
        error: "Failed to list communities",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/communities/:communityId
 * Get a specific community by ID
 */
export async function handleGetCommunity(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    const communityId = c.req.param("communityId");

    if (!campaignId || !communityId) {
      return c.json({ error: "Campaign ID and Community ID required" }, 400);
    }

    // Verify campaign ownership
    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    const community =
      await daoFactory.communityDAO.getCommunityById(communityId);

    if (!community || community.campaignId !== campaignId) {
      return c.json({ error: "Community not found" }, 404);
    }

    // Get children if requested
    const includeChildren = c.req.query("includeChildren") === "true";
    let children: any[] = [];
    if (includeChildren) {
      children = await daoFactory.communityDAO.getChildCommunities(communityId);
    }

    return c.json({
      success: true,
      community,
      children: includeChildren ? children : undefined,
    });
  } catch (error) {
    console.error("[Communities] Error getting community:", error);
    return c.json(
      {
        error: "Failed to get community",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/communities/level/:level
 * Get communities at a specific level
 */
export async function handleGetCommunitiesByLevel(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    const levelParam = c.req.param("level");

    if (!campaignId || levelParam === undefined) {
      return c.json({ error: "Campaign ID and level required" }, 400);
    }

    const level = parseInt(levelParam, 10);
    if (Number.isNaN(level)) {
      return c.json({ error: "Invalid level parameter" }, 400);
    }

    // Verify campaign ownership
    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    const communities = await daoFactory.communityDAO.getCommunitiesByLevel(
      campaignId,
      level
    );

    return c.json({
      success: true,
      communities,
      level,
      count: communities.length,
    });
  } catch (error) {
    console.error("[Communities] Error getting communities by level:", error);
    return c.json(
      {
        error: "Failed to get communities by level",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/communities/:communityId/children
 * Get child communities of a parent community
 */
export async function handleGetChildCommunities(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    const communityId = c.req.param("communityId");

    if (!campaignId || !communityId) {
      return c.json({ error: "Campaign ID and Community ID required" }, 400);
    }

    // Verify campaign ownership
    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    const community =
      await daoFactory.communityDAO.getCommunityById(communityId);

    if (!community || community.campaignId !== campaignId) {
      return c.json({ error: "Community not found" }, 404);
    }

    const children =
      await daoFactory.communityDAO.getChildCommunities(communityId);

    return c.json({
      success: true,
      children,
      count: children.length,
    });
  } catch (error) {
    console.error("[Communities] Error getting child communities:", error);
    return c.json(
      {
        error: "Failed to get child communities",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/communities/hierarchy
 * Get the complete community hierarchy tree
 */
export async function handleGetCommunityHierarchy(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignId = c.req.param("campaignId");
    if (!campaignId) {
      return c.json({ error: "Campaign ID required" }, 400);
    }

    // Verify campaign ownership
    const daoFactory = getDAOFactory(c.env);
    const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      return c.json({ error: "Campaign not found or access denied" }, 404);
    }

    const communities =
      await daoFactory.communityDAO.listCommunitiesByCampaign(campaignId);

    const hierarchy = buildCommunityHierarchyTree(communities);

    return c.json({
      success: true,
      hierarchy,
      stats: calculateCommunityStats(communities),
    });
  } catch (error) {
    console.error("[Communities] Error getting community hierarchy:", error);
    return c.json(
      {
        error: "Failed to get community hierarchy",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
