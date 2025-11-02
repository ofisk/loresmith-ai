import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { CampaignContextSyncService } from "@/services/campaign/campaign-context-sync-service";
import { getDAOFactory } from "../../dao/dao-factory";
import { notifyShardGeneration } from "../../lib/notifications";
import { ALL_CONTEXT_TYPES } from "../../constants/context-types";

// Helper function to get environment from context
function getEnvFromContext(context: any): any {
  if (context?.env) {
    return context.env;
  }
  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    return (globalThis as any).env;
  }
  return null;
}

/**
 * Tool for capturing campaign context from conversations
 * Creates staging shards that require user approval (same flow as file uploads)
 */
export const captureConversationalContext = tool({
  description: `Capture important campaign information from the conversation that should be saved for future reference.
  
  Use this when you detect:
  - User commits to a plot direction or decision
  - User establishes world-building facts
  - User makes character/NPC decisions
  - User sets campaign themes or preferences
  - User creates house rules
  - User provides detailed descriptions of locations, NPCs, factions, or world elements
  - User describes specific scenes, quests, or plot hooks they want to use
  - Any information that would be useful to remember for this campaign
  
  IMPORTANT: Capture rich descriptive content in full - multi-paragraph location descriptions, NPC backstories,
  faction details, etc. The shard system is designed to handle detailed campaign content.
  
  The captured context will be saved as a pending shard for user review and approval.`,

  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    contextType: z
      .enum(ALL_CONTEXT_TYPES)
      .describe("The type of context being captured"),
    title: z
      .string()
      .describe(
        "A short, descriptive title for this context (e.g., 'Main Plot Selected', 'Campaign Themes')"
      ),
    content: z
      .string()
      .describe("The full context to save - be specific and detailed"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "How confident you are this should be saved (0-1, default 0.8)"
      ),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorization"),
    sourceMessageId: z
      .string()
      .optional()
      .describe("ID of the message this context was extracted from"),
    jwt: commonSchemas.jwt,
  }),

  execute: async (
    {
      campaignId,
      contextType,
      title,
      content,
      confidence = 0.8,
      tags: _tags,
      sourceMessageId,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || "unknown";

    console.log("[captureConversationalContext] Called with:", {
      campaignId,
      contextType,
      title,
      contentLength: content.length,
      confidence,
    });

    try {
      const env = getEnvFromContext(context);

      if (!env) {
        return createToolError(
          "Environment not available",
          "Unable to save campaign context",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          AUTH_CODES.INVALID_KEY,
          toolCallId
        );
      }

      // Verify campaign exists and belongs to user
      const campaignDAO = getDAOFactory(env).campaignDAO;
      const campaign = await campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found",
          404,
          toolCallId
        );
      }

      // Create staging shard (requires user approval)
      const syncService = new CampaignContextSyncService(env);
      const noteId = crypto.randomUUID();

      const { stagingKey } = await syncService.createStagingShard(
        campaignId,
        noteId,
        title,
        content,
        contextType,
        confidence,
        sourceMessageId
      );

      console.log("[captureConversationalContext] Created staging shard:", {
        stagingKey,
        noteId,
        title,
      });

      // Send notification to user about new pending shard
      try {
        await notifyShardGeneration(
          env,
          userId,
          campaign.name,
          `Conversation: ${title}`,
          1 // One shard created
        );
        console.log("[captureConversationalContext] Sent notification to user");
      } catch (notifyError) {
        console.error(
          "[captureConversationalContext] Failed to send notification:",
          notifyError
        );
        // Don't fail the operation if notification fails
      }

      return createToolSuccess(
        `I've captured "${title}" as campaign context. It's pending your review in the shard management panel.`,
        {
          id: noteId,
          stagingKey,
          contextType,
          title,
          confidence,
          requiresApproval: true,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[captureConversationalContext] Error:", error);
      return createToolError(
        "Failed to capture campaign context",
        error,
        500,
        toolCallId
      );
    }
  },
});

/**
 * Tool for the user to explicitly request context to be saved
 * Creates a staging shard with high confidence for user review
 */
export const saveContextExplicitly = tool({
  description: `Save campaign context when the user explicitly asks to remember or save something.
  
  Use this when user says things like:
  - "Remember this"
  - "Add this to the campaign"
  - "Don't forget that"
  - "Save this for later"
  
  This creates a staging shard for user review (allows them to verify content was captured correctly).`,

  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    contextType: z
      .enum(ALL_CONTEXT_TYPES)
      .describe("The type of context being saved"),
    title: z.string().describe("A short, descriptive title"),
    content: z.string().describe("The content to save"),
    jwt: commonSchemas.jwt,
  }),

  execute: async (
    { campaignId, contextType, title, content, jwt },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || "unknown";

    console.log("[saveContextExplicitly] Called with:", {
      campaignId,
      contextType,
      title,
    });

    try {
      const env = getEnvFromContext(context);

      if (!env) {
        return createToolError(
          "Environment not available",
          "Unable to save campaign context",
          500,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          AUTH_CODES.INVALID_KEY,
          toolCallId
        );
      }

      // Verify campaign exists and belongs to user
      const campaignDAO = getDAOFactory(env).campaignDAO;
      const campaign = await campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found",
          404,
          toolCallId
        );
      }

      // Create staging shard with high confidence (user explicitly requested)
      const syncService = new CampaignContextSyncService(env);
      const noteId = crypto.randomUUID();

      const { stagingKey } = await syncService.createStagingShard(
        campaignId,
        noteId,
        title,
        content,
        contextType,
        0.95, // High confidence for explicit user requests
        undefined // No specific source message
      );

      console.log("[saveContextExplicitly] Created staging shard:", {
        stagingKey,
        noteId,
        title,
        contextType,
      });

      // Send notification to user about new pending shard
      try {
        await notifyShardGeneration(
          env,
          userId,
          campaign.name,
          `Conversation: ${title}`,
          1
        );
        console.log("[saveContextExplicitly] Sent notification to user");
      } catch (notifyError) {
        console.error(
          "[saveContextExplicitly] Failed to send notification:",
          notifyError
        );
        // Don't fail the operation if notification fails
      }

      return createToolSuccess(
        `I've saved "${title}" for your review. You can approve it in the shard management panel.`,
        {
          id: noteId,
          stagingKey,
          contextType,
          title,
          requiresApproval: true,
          confidence: 0.95,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[saveContextExplicitly] Error:", error);
      return createToolError(
        "Failed to save campaign context",
        error,
        500,
        toolCallId
      );
    }
  },
});
