import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { SNIPPET_STATUSES } from "../lib/content-types";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Get staged snippets for a campaign
export async function handleGetStagedSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;

    console.log(`[Server] Getting staged snippets for campaign: ${campaignId}`);

    // Verify campaign belongs to user
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const stagedSnippetsDAO = getDAOFactory(c.env).stagedSnippetsDAO;
    const stagedSnippets =
      await stagedSnippetsDAO.getStagedSnippetsByCampaign(campaignId);

    console.log(
      `[Server] Found ${stagedSnippets.length} staged snippets for campaign: ${campaignId}`
    );

    return c.json({ snippets: stagedSnippets });
  } catch (error) {
    console.error("[Server] Error getting staged snippets:", error);
    return c.json({ error: "Failed to get staged snippets" }, 500);
  }
}

// Approve snippets for a campaign
export async function handleApproveSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { snippetIds } = await c.req.json();

    if (!snippetIds || !Array.isArray(snippetIds) || snippetIds.length === 0) {
      return c.json({ error: "snippetIds array is required" }, 400);
    }

    console.log(
      `[Server] Approving ${snippetIds.length} snippets for campaign: ${campaignId}`
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

    const stagedSnippetsDAO = getDAOFactory(c.env).stagedSnippetsDAO;

    // Bulk update snippets to approved status
    await stagedSnippetsDAO.bulkUpdateSnippetStatuses(
      snippetIds,
      SNIPPET_STATUSES.APPROVED
    );

    console.log(
      `[Server] Approved ${snippetIds.length} snippets for campaign: ${campaignId}`
    );

    return c.json({ success: true, approvedCount: snippetIds.length });
  } catch (error) {
    console.error("[Server] Error approving snippets:", error);
    return c.json({ error: "Failed to approve snippets" }, 500);
  }
}

// Reject snippets for a campaign
export async function handleRejectSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { snippetIds, reason } = await c.req.json();

    if (!snippetIds || !Array.isArray(snippetIds) || snippetIds.length === 0) {
      return c.json({ error: "snippetIds array is required" }, 400);
    }

    if (!reason) {
      return c.json({ error: "reason is required" }, 400);
    }

    console.log(
      `[Server] Rejecting ${snippetIds.length} snippets for campaign: ${campaignId}, reason: ${reason}`
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

    const stagedSnippetsDAO = getDAOFactory(c.env).stagedSnippetsDAO;

    // Bulk update snippets to rejected status
    await stagedSnippetsDAO.bulkUpdateSnippetStatuses(
      snippetIds,
      SNIPPET_STATUSES.REJECTED
    );

    console.log(
      `[Server] Rejected ${snippetIds.length} snippets for campaign: ${campaignId}`
    );

    return c.json({ success: true, rejectedCount: snippetIds.length });
  } catch (error) {
    console.error("[Server] Error rejecting snippets:", error);
    return c.json({ error: "Failed to reject snippets" }, 500);
  }
}

// Search approved snippets for a campaign
export async function handleSearchApprovedSnippets(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");
    const userAuth = (c as any).userAuth;
    const { query } = await c.req.json();

    if (!query) {
      return c.json({ error: "query parameter is required" }, 400);
    }

    console.log(
      `[Server] Searching approved snippets for campaign: ${campaignId}, query: ${query}`
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

    const stagedSnippetsDAO = getDAOFactory(c.env).stagedSnippetsDAO;
    const searchResults = await stagedSnippetsDAO.searchApprovedSnippets(
      campaignId,
      query
    );

    console.log(
      `[Server] Found ${searchResults.length} search results for campaign: ${campaignId}`
    );

    return c.json({ results: searchResults });
  } catch (error) {
    console.error("[Server] Error searching approved snippets:", error);
    return c.json({ error: "Failed to search snippets" }, 500);
  }
}
