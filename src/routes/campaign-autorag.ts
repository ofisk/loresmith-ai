import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { getCampaignAutoRAGService } from "../lib/service-factory";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

/**
 * Get staged snippets for a campaign
 * GET /campaigns/:campaignId/snippets/staged
 */
export async function handleGetStagedSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;

    // Get campaign RAG base path
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json({ error: "Campaign AutoRAG not initialized" }, 404);
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Get staged snippets
    const stagedSnippets = await campaignAutoRAG.getStagedSnippets();

    return c.json({ snippets: stagedSnippets });
  } catch (error) {
    console.error("[Server] Error getting staged snippets:", error);
    return c.json({ error: "Failed to get staged snippets" }, 500);
  }
}

/**
 * Approve snippets
 * POST /campaigns/:campaignId/snippets/approve
 */
export async function handleApproveSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { stagingKey, expansions } = await c.req.json();

    if (!stagingKey) {
      return c.json({ error: "stagingKey is required" }, 400);
    }

    // Get campaign RAG base path
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json({ error: "Campaign AutoRAG not initialized" }, 404);
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Approve snippets
    await campaignAutoRAG.approveSnippets(stagingKey, expansions);

    return c.json({ success: true });
  } catch (error) {
    console.error("[Server] Error approving snippets:", error);
    return c.json({ error: "Failed to approve snippets" }, 500);
  }
}

/**
 * Reject snippets
 * POST /campaigns/:campaignId/snippets/reject
 */
export async function handleRejectSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { stagingKey, reason } = await c.req.json();

    if (!stagingKey) {
      return c.json({ error: "stagingKey is required" }, 400);
    }

    if (!reason) {
      return c.json({ error: "reason is required" }, 400);
    }

    // Get campaign RAG base path
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json({ error: "Campaign AutoRAG not initialized" }, 404);
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Reject snippets
    await campaignAutoRAG.rejectSnippets(stagingKey, reason);

    return c.json({ success: true });
  } catch (error) {
    console.error("[Server] Error rejecting snippets:", error);
    return c.json({ error: "Failed to reject snippets" }, 500);
  }
}

/**
 * Search approved snippets
 * GET /campaigns/:campaignId/snippets/approved
 */
export async function handleSearchApprovedSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const { query } = c.req.query();
    const userAuth = (c as any).userAuth;

    if (!query) {
      return c.json({ error: "query parameter is required" }, 400);
    }

    // Get campaign RAG base path
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json({ error: "Campaign AutoRAG not initialized" }, 404);
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Search approved snippets
    const searchResults = await campaignAutoRAG.search(query);

    return c.json({ results: searchResults });
  } catch (error) {
    console.error("[Server] Error searching approved snippets:", error);
    return c.json({ error: "Failed to search snippets" }, 500);
  }
}
