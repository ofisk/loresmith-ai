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
 * Approve snippets from staging
 * POST /campaigns/:campaignId/autorag/approve
 */
export async function handleApproveSnippets(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const { stagingKey, expansions } = await c.req.json();

    if (!stagingKey) {
      return c.json({ error: "Staging key is required" }, 400);
    }

    // Get campaign RAG base path using DAO - this verifies user ownership
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json(
        { error: "Campaign not found or AutoRAG not initialized" },
        404
      );
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Approve snippets
    await campaignAutoRAG.approveSnippets(stagingKey, expansions);

    // Trigger sync
    await campaignAutoRAG.sync();

    console.log(
      `[CampaignAutoRAG] Approved snippets for campaign: ${campaignId}`
    );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error approving snippets:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/**
 * Reject snippets from staging
 * POST /campaigns/:campaignId/autorag/reject
 */
export async function handleRejectSnippets(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const { stagingKey, reason } = await c.req.json();

    if (!stagingKey) {
      return c.json({ error: "Staging key is required" }, 400);
    }

    if (!reason) {
      return c.json({ error: "Rejection reason is required" }, 400);
    }

    // Get campaign RAG base path using DAO - this verifies user ownership
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json(
        { error: "Campaign not found or AutoRAG not initialized" },
        404
      );
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Reject snippets
    await campaignAutoRAG.rejectSnippets(stagingKey, reason);

    // Trigger sync
    await campaignAutoRAG.sync();

    console.log(
      `[CampaignAutoRAG] Rejected snippets for campaign: ${campaignId}`
    );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error rejecting snippets:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/**
 * Search campaign content (approved only)
 * POST /campaigns/:campaignId/autorag/search
 */
export async function handleSearchCampaignContent(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const { query, limit = 10 } = await c.req.json();

    if (!query) {
      return c.json({ error: "Query is required" }, 400);
    }

    // Get campaign RAG base path using DAO - this verifies user ownership
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json(
        { error: "Campaign not found or AutoRAG not initialized" },
        404
      );
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Search content (automatically filtered to approved)
    const results = await campaignAutoRAG.search(query, { limit });

    console.log(
      `[CampaignAutoRAG] Search returned ${results.total} results for campaign: ${campaignId}`
    );

    return c.json({ results: results.results, total: results.total });
  } catch (error) {
    console.error("Error searching campaign content:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/**
 * Search rejected snippets (admin/QA only)
 * POST /campaigns/:campaignId/autorag/search-rejected
 */
export async function handleSearchRejectedSnippets(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const { query, limit = 10 } = await c.req.json();

    if (!query) {
      return c.json({ error: "Query is required" }, 400);
    }

    // Get campaign RAG base path using DAO - this verifies user ownership
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
      userAuth.username,
      campaignId
    );

    if (!campaignRagBasePath) {
      return c.json(
        { error: "Campaign not found or AutoRAG not initialized" },
        404
      );
    }

    // Get CampaignAutoRAG service
    const campaignAutoRAG = getCampaignAutoRAGService(
      c.env,
      campaignRagBasePath
    );

    // Search rejected content
    const results = await campaignAutoRAG.searchRejected(query, { limit });

    console.log(
      `[CampaignAutoRAG] Rejected search returned ${results.total} results for campaign: ${campaignId}`
    );

    return c.json({ results: results.results, total: results.total });
  } catch (error) {
    console.error("Error searching rejected snippets:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
