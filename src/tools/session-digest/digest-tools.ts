import { tool } from "ai";
import type { ToolExecuteOptions } from "../utils";
import { z } from "zod";
import { generateId } from "ai";
import {
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  type ToolEnv,
} from "@/tools/utils";
import { getDAOFactory } from "@/dao/dao-factory";
import { validateSessionDigestData } from "@/types/session-digest";
import type { UpdateSessionDigestInput } from "@/types/session-digest";
import type { ToolResult } from "@/app-constants";
import type { VectorizeIndex } from "@cloudflare/workers-types";
import { PlanningContextService } from "@/services/rag/planning-context-service";

const commonSchemas = {
  campaignId: z.string().describe("The campaign ID"),
  jwt: z.string().optional().describe("JWT token for authentication"),
  digestId: z.string().describe("The session digest ID"),
  sessionNumber: z
    .number()
    .int()
    .nonnegative()
    .describe("The session number (e.g., 0, 1, 2, 3)"),
  sessionDate: z
    .string()
    .optional()
    .nullable()
    .describe(
      "ISO date string for the session date (YYYY-MM-DD format). Convert relative dates like 'yesterday' to actual dates. For example, if today is 2024-11-17 and the user says 'yesterday', use '2024-11-16'."
    ),
  digestData: z
    .object({
      last_session_recap: z.object({
        key_events: z.array(z.string()).default([]),
        state_changes: z
          .object({
            factions: z.array(z.string()).default([]),
            locations: z.array(z.string()).default([]),
            npcs: z
              .array(z.string())
              .default([])
              .describe(
                "Array of NPC state changes as strings. Format: 'NPC Name - status: description'. Example: ['Guard Captain - deceased: fell in battle'] or ['Merchant - relocated: moved to neighboring town']. Do NOT use objects."
              ),
          })
          .default({ factions: [], locations: [], npcs: [] }),
        open_threads: z.array(z.string()).default([]),
      }),
      next_session_plan: z.object({
        objectives_dm: z.array(z.string()).default([]),
        probable_player_goals: z.array(z.string()).default([]),
        beats: z.array(z.string()).default([]),
        if_then_branches: z.array(z.string()).default([]),
      }),
      npcs_to_run: z.array(z.string()).default([]),
      locations_in_focus: z.array(z.string()).default([]),
      encounter_seeds: z.array(z.string()).default([]),
      clues_and_revelations: z.array(z.string()).default([]),
      treasure_and_rewards: z.array(z.string()).default([]),
      todo_checklist: z.array(z.string()).default([]),
    })
    .describe(
      `The session digest data structure. The last_session_recap and next_session_plan objects are required, but all arrays within them are optional and will default to empty arrays if not provided.

IMPORTANT: All arrays contain STRINGS only, not objects. For state_changes.npcs, use string format like "NPC Name - status: description". Examples:
- ["Guard Captain - deceased: fell in battle"]
- ["Merchant - relocated: moved to neighboring town"]
- ["Noble - active: encountered the party in the dungeons"]`
    ),
};

const createSessionDigestParameters = z.object({
  campaignId: commonSchemas.campaignId,
  sessionNumber: commonSchemas.sessionNumber,
  sessionDate: commonSchemas.sessionDate,
  digestData: commonSchemas.digestData,
  jwt: commonSchemas.jwt,
});

export const createSessionDigestTool = tool({
  description:
    "Create a new session digest for a campaign. Session digests capture high-level recaps and planning information for game sessions.",
  inputSchema: createSessionDigestParameters,
  execute: async (
    input: z.infer<typeof createSessionDigestParameters>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, sessionNumber, sessionDate, digestData, jwt } = input;
    const toolCallId = options?.toolCallId ?? crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      if (!validateSessionDigestData(digestData)) {
        // Provide detailed validation feedback
        const validationErrors: string[] = [];
        if (!digestData || typeof digestData !== "object") {
          validationErrors.push("digestData must be an object");
        } else {
          const obj = digestData as Record<string, unknown>;
          if (
            !obj.last_session_recap ||
            typeof obj.last_session_recap !== "object"
          ) {
            validationErrors.push(
              "last_session_recap is required and must be an object"
            );
          }
          if (
            !obj.next_session_plan ||
            typeof obj.next_session_plan !== "object"
          ) {
            validationErrors.push(
              "next_session_plan is required and must be an object"
            );
          }
          const requiredArrays = [
            "npcs_to_run",
            "locations_in_focus",
            "encounter_seeds",
            "clues_and_revelations",
            "treasure_and_rewards",
            "todo_checklist",
          ];
          for (const key of requiredArrays) {
            if (!Array.isArray(obj[key])) {
              validationErrors.push(`${key} must be an array`);
            }
          }
        }

        console.error("[createSessionDigestTool] Validation failed:", {
          validationErrors,
          digestDataKeys: digestData
            ? Object.keys(digestData as Record<string, unknown>)
            : [],
        });

        return createToolError(
          "Invalid digest data structure",
          `The digest data does not match the required schema. Issues: ${validationErrors.join("; ")}`,
          400,
          toolCallId
        );
      }

      const env = options?.env as ToolEnv | undefined;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Check if digest already exists for this session number
      const existing =
        await daoFactory.sessionDigestDAO.getSessionDigestByCampaignAndSession(
          campaignId,
          sessionNumber
        );

      if (existing) {
        return createToolError(
          "Session digest already exists",
          `A session digest already exists for session ${sessionNumber}. Ask the user whether they want to append to the existing digest or replace it entirely. If they want to append, use the updateSessionDigest tool. If they want to replace, confirm with the user first, then use the updateSessionDigest tool with the new data.`,
          409,
          toolCallId
        );
      }

      const digestId = generateId();

      await daoFactory.sessionDigestDAO.createSessionDigest(digestId, {
        campaignId,
        sessionNumber,
        sessionDate: sessionDate || null,
        digestData,
      });

      const created =
        await daoFactory.sessionDigestDAO.getSessionDigestById(digestId);
      if (!created) {
        return createToolError(
          "Failed to retrieve created digest",
          "Digest was created but could not be retrieved",
          500,
          toolCallId
        );
      }

      // Validation happens automatically in PlanningContextService constructor
      const planningService = new PlanningContextService(
        env.DB!,
        env.VECTORIZE as VectorizeIndex,
        env.OPENAI_API_KEY as string,
        env
      );
      await planningService.indexSessionDigest(created);

      return createToolSuccess(
        `Session digest created successfully for session ${sessionNumber}`,
        { digest: created },
        toolCallId,
        campaignId,
        campaign.name
      );
    } catch (error) {
      const errorDetails: Record<string, unknown> = {
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : typeof error,
        errorStack: error instanceof Error ? error.stack : undefined,
        campaignId,
        sessionNumber,
        sessionDate,
        hasDigestData: !!digestData,
      };

      console.error("[createSessionDigestTool] Error:", errorDetails);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return createToolError(
        "Failed to create session digest",
        errorMessage,
        500,
        toolCallId
      );
    }
  },
});

const getSessionDigestParameters = z.object({
  campaignId: commonSchemas.campaignId,
  sessionNumber: commonSchemas.sessionNumber,
  jwt: commonSchemas.jwt,
});

export const getSessionDigestTool = tool({
  description:
    "Get a session digest by campaign ID and session number. Returns the full digest data including recap and planning information.",
  inputSchema: getSessionDigestParameters,
  execute: async (
    input: z.infer<typeof getSessionDigestParameters>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, sessionNumber, jwt } = input;
    const toolCallId = options?.toolCallId ?? crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const env = options?.env as ToolEnv | undefined;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      const digest =
        await daoFactory.sessionDigestDAO.getSessionDigestByCampaignAndSession(
          campaignId,
          sessionNumber
        );

      if (!digest) {
        return createToolError(
          "Session digest not found",
          `No session digest found for session ${sessionNumber} in this campaign`,
          404,
          toolCallId
        );
      }

      return createToolSuccess(
        `Session digest retrieved successfully for session ${sessionNumber}`,
        { digest },
        toolCallId
      );
    } catch (error) {
      console.error("[getSessionDigestTool] Error:", error);
      return createToolError(
        "Failed to get session digest",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

const listSessionDigestsParameters = z.object({
  campaignId: commonSchemas.campaignId,
  jwt: commonSchemas.jwt,
});

export const listSessionDigestsTool = tool({
  description:
    "List all session digests for a campaign. Returns digests ordered by session number (newest first).",
  inputSchema: listSessionDigestsParameters,
  execute: async (
    input: z.infer<typeof listSessionDigestsParameters>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt } = input;
    const toolCallId = options?.toolCallId ?? crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const env = options?.env as ToolEnv | undefined;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      const digests =
        await daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(
          campaignId
        );

      return createToolSuccess(
        `Found ${digests.length} session digest(s)`,
        { digests, count: digests.length },
        toolCallId
      );
    } catch (error) {
      console.error("[listSessionDigestsTool] Error:", error);
      return createToolError(
        "Failed to list session digests",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});

const updateSessionDigestParameters = z.object({
  campaignId: commonSchemas.campaignId,
  sessionNumber: commonSchemas.sessionNumber,
  sessionDate: commonSchemas.sessionDate.optional(),
  digestData: commonSchemas.digestData.optional(),
  jwt: commonSchemas.jwt,
});

export const updateSessionDigestTool = tool({
  description:
    "Update an existing session digest for a campaign. Use campaignId and sessionNumber to identify which digest to update. Typically, the agent should first fetch the existing digest, merge in any new recap details, then call this tool with the updated digest data.",
  inputSchema: updateSessionDigestParameters,
  execute: async (
    input: z.infer<typeof updateSessionDigestParameters>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, sessionNumber, sessionDate, digestData, jwt } = input;
    const toolCallId = options?.toolCallId ?? crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const env = options?.env as ToolEnv | undefined;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Get the existing digest by sessionNumber (there's only one per session)
      const existing =
        await daoFactory.sessionDigestDAO.getSessionDigestByCampaignAndSession(
          campaignId,
          sessionNumber
        );

      if (!existing) {
        return createToolError(
          "Session digest not found",
          `No session digest found for session ${sessionNumber} in this campaign`,
          404,
          toolCallId
        );
      }

      const updateInput: UpdateSessionDigestInput = {};

      if (sessionDate !== undefined) {
        updateInput.sessionDate = sessionDate || null;
      }

      if (digestData !== undefined) {
        if (!validateSessionDigestData(digestData)) {
          return createToolError(
            "Invalid digest data structure",
            "The digest data does not match the required schema",
            400,
            toolCallId
          );
        }
        updateInput.digestData = digestData;
      }

      if (Object.keys(updateInput).length === 0) {
        return createToolError(
          "No fields to update",
          "Provide at least one field (sessionDate or digestData) to update",
          400,
          toolCallId
        );
      }

      // Use existing.id since we've already found the digest
      const targetDigestId = existing.id;

      await daoFactory.sessionDigestDAO.updateSessionDigest(
        targetDigestId,
        updateInput
      );

      const updated =
        await daoFactory.sessionDigestDAO.getSessionDigestById(targetDigestId);

      if (!updated) {
        return createToolError(
          "Failed to retrieve updated digest",
          "Session digest was updated but could not be retrieved",
          500,
          toolCallId
        );
      }

      const planningService = new PlanningContextService(
        env.DB!,
        env.VECTORIZE as VectorizeIndex,
        env.OPENAI_API_KEY as string,
        env
      );
      await planningService.indexSessionDigest(updated);

      return createToolSuccess(
        "Session digest updated successfully",
        { digest: updated },
        toolCallId
      );
    } catch (error) {
      console.error("[updateSessionDigestTool] Error:", error);
      console.error("[updateSessionDigestTool] Error details:", {
        campaignId,
        sessionNumber,
        hasSessionDate: sessionDate !== undefined,
        hasDigestData: digestData !== undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      return createToolError(
        "Failed to update session digest",
        error instanceof Error ? error.message : "Unknown error",
        500,
        toolCallId
      );
    }
  },
});
