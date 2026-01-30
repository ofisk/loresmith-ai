import type { D1Database } from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "@/app-constants";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
} from "../utils";
import { getDAOFactory } from "@/dao/dao-factory";
import { generateHooks } from "./planning-tools-utils";

export const generateSessionHooks = tool({
  description:
    "Generate engaging session hooks and story beats to start or continue a session",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    hookType: z
      .enum(["opening", "transition", "cliffhanger", "resolution"])
      .optional()
      .describe("Type of hook to generate (default: opening)"),
    context: z
      .string()
      .optional()
      .describe("Additional context for hook generation"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, hookType = "opening", context: contextParam, jwt },
    context?: { env?: unknown; toolCallId?: string }
  ): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[generateSessionHooks] Using toolCallId:", toolCallId);

    console.log("[Tool] generateSessionHooks received:", {
      campaignId,
      hookType,
      context: contextParam,
    });

    try {
      const env = getEnvFromContext(context);
      console.log("[Tool] generateSessionHooks - Environment found:", !!env);
      console.log("[Tool] generateSessionHooks - JWT provided:", !!jwt);

      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] generateSessionHooks - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
            toolCallId
          );
        }

        const daoFactory = getDAOFactory(env as { DB: D1Database });
        const campaign =
          await daoFactory.campaignDAO.getCampaignByIdWithMapping(
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

        const [characters, resources] = await Promise.all([
          daoFactory.campaignDAO.getCampaignCharacters(campaignId),
          daoFactory.campaignDAO.getCampaignResources(campaignId),
        ]);

        const hooks = await generateHooks(
          hookType,
          contextParam ?? "",
          characters,
          resources
        );

        console.log("[Tool] Generated hooks:", hooks.length);

        return createToolSuccess(
          `Generated ${hooks.length} ${hookType} hooks`,
          {
            hookType,
            hooks,
            totalCount: hooks.length,
            context: {
              characters: characters.length,
              resources: resources.length,
            },
          },
          toolCallId
        );
      }

      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            campaignId,
            hookType,
            context: contextParam,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to generate session hooks",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as { hooks?: unknown[] };
      return createToolSuccess(
        `Generated ${result.hooks?.length || 0} ${hookType} hooks`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error generating session hooks:", error);
      return createToolError(
        "Failed to generate session hooks",
        error instanceof Error ? error.message : String(error),
        500,
        toolCallId
      );
    }
  },
});
