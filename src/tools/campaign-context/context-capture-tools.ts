import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import type { Env } from "@/middleware/auth";
import { CampaignContextSyncService } from "@/services/campaign/campaign-context-sync-service";
import { getDAOFactory } from "../../dao/dao-factory";
import { notifyShardGeneration } from "../../lib/notifications";
import { ALL_CONTEXT_TYPES } from "../../constants/context-types";

const captureConversationalContextSchema = z.object({
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
    .describe("How confident you are this should be saved (0-1, default 0.8)"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags for categorization"),
  sourceMessageId: z
    .string()
    .optional()
    .describe("ID of the message this context was extracted from"),
  relatedPlanningTaskId: z
    .string()
    .optional()
    .describe(
      "Optional planning task id that this captured context fulfills or advances."
    ),
  jwt: commonSchemas.jwt,
});

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

  inputSchema: captureConversationalContextSchema,

  execute: async (
    input: z.infer<typeof captureConversationalContextSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const {
      campaignId,
      contextType,
      title,
      content,
      confidence = 0.8,
      sourceMessageId,
      relatedPlanningTaskId,
      jwt,
    } = input;
    const toolCallId = options?.toolCallId ?? "unknown";

    console.log("[captureConversationalContext] Called with:", {
      campaignId,
      contextType,
      title,
      contentLength: content.length,
      confidence,
    });

    try {
      const env = getEnvFromContext(options);

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
      const daoFactory = getDAOFactory(env);
      const campaignDAO = daoFactory.campaignDAO;
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

      // Extract OpenAI API key from JWT if available
      let openaiApiKey: string | undefined;
      try {
        if (jwt) {
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          openaiApiKey = payload.openaiApiKey;
        }
      } catch {
        // JWT parsing failed, continue without OpenAI key
      }

      // Create staging shard (requires user approval)
      const syncService = new CampaignContextSyncService(env as Env);
      const noteId = crypto.randomUUID();

      const result = await syncService.createStagingShard(
        campaignId,
        noteId,
        title,
        content,
        contextType,
        confidence,
        sourceMessageId,
        env as Env,
        openaiApiKey
      );

      // If duplicate found, return success but indicate it was skipped
      if (result.isDuplicate) {
        console.log(
          "[captureConversationalContext] Shard skipped (semantic duplicate):",
          {
            noteId,
            title,
          }
        );
        return createToolSuccess(
          `Context "${title}" was not saved because it's very similar to existing content.`,
          { skipped: true, reason: "duplicate" },
          toolCallId
        );
      }

      console.log("[captureConversationalContext] Created staging shard:", {
        stagingKey: result.stagingKey,
        noteId,
        title,
      });

      // Optionally link this captured context to a planning task
      try {
        const planningTaskDAO = daoFactory.planningTaskDAO;
        let planningTaskIdToUpdate: string | null =
          relatedPlanningTaskId ?? null;

        // If no explicit planning task id was provided, attempt a simple match
        if (!planningTaskIdToUpdate) {
          const openTasks = await planningTaskDAO.listByCampaign(campaignId, {
            status: ["pending", "in_progress"],
          });

          const contentLower = content.toLowerCase();

          let bestTaskId: string | null = null;
          let bestScore = 0;

          for (const task of openTasks) {
            const titleLower = task.title.toLowerCase();
            let score = 0;

            if (contentLower.includes(titleLower)) {
              score += 3;
            }

            const words = titleLower.split(/\s+/).filter((w) => w.length > 3);
            for (const word of words) {
              if (contentLower.includes(word)) {
                score += 1;
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestTaskId = task.id;
            }
          }

          // Require a modest score to avoid accidental matches
          if (bestTaskId && bestScore >= 2) {
            planningTaskIdToUpdate = bestTaskId;
          }
        }

        if (planningTaskIdToUpdate) {
          await planningTaskDAO.updateStatus(
            planningTaskIdToUpdate,
            "completed",
            noteId
          );
          console.log(
            "[captureConversationalContext] Linked planning task to captured context",
            {
              planningTaskId: planningTaskIdToUpdate,
              noteId,
            }
          );
        }
      } catch (planningTaskError) {
        console.error(
          "[captureConversationalContext] Failed to update planning task status:",
          planningTaskError
        );
        // Do not fail the capture operation if planning task linkage fails
      }

      // Send notification to user about new pending shard
      try {
        await notifyShardGeneration(
          env as Env,
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
          stagingKey: result.stagingKey,
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

const saveContextExplicitlySchema = z.object({
  campaignId: commonSchemas.campaignId,
  contextType: z
    .enum(ALL_CONTEXT_TYPES)
    .describe("The type of context being saved"),
  title: z.string().describe("A short, descriptive title"),
  content: z.string().describe("The content to save"),
  jwt: commonSchemas.jwt,
});

export const saveContextExplicitly = tool({
  description: `Save campaign context when the user explicitly asks to remember or save something.
  
  Use this when user says things like:
  - "Remember this"
  - "Add this to the campaign"
  - "Don't forget that"
  - "Save this for later"
  
  This creates a staging shard for user review (allows them to verify content was captured correctly).`,

  inputSchema: saveContextExplicitlySchema,

  execute: async (
    input: z.infer<typeof saveContextExplicitlySchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, contextType, title, content, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";

    console.log("[saveContextExplicitly] Called with:", {
      campaignId,
      contextType,
      title,
    });

    try {
      const env = getEnvFromContext(options);

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

      // Extract OpenAI API key from JWT if available
      let openaiApiKey: string | undefined;
      try {
        if (jwt) {
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          openaiApiKey = payload.openaiApiKey;
        }
      } catch {
        // JWT parsing failed, continue without OpenAI key
      }

      // Create staging shard with high confidence (user explicitly requested)
      const syncService = new CampaignContextSyncService(env as Env);
      const noteId = crypto.randomUUID();

      const result = await syncService.createStagingShard(
        campaignId,
        noteId,
        title,
        content,
        contextType,
        0.95, // High confidence for explicit user requests
        undefined, // No specific source message
        env as Env,
        openaiApiKey
      );

      // If duplicate found, return success but indicate it was skipped
      if (result.isDuplicate) {
        console.log(
          "[saveContextExplicitly] Shard skipped (semantic duplicate):",
          {
            noteId,
            title,
          }
        );
        return createToolSuccess(
          `Context "${title}" was not saved because it's very similar to existing content.`,
          { skipped: true, reason: "duplicate" },
          toolCallId
        );
      }

      console.log("[saveContextExplicitly] Created staging shard:", {
        stagingKey: result.stagingKey,
        noteId,
        title,
        contextType,
      });

      // Send notification to user about new pending shard
      try {
        await notifyShardGeneration(
          env as Env,
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
          stagingKey: result.stagingKey,
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
