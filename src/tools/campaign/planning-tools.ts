import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";

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

// Tool to plan a session
export const planSession = tool({
  description:
    "Plan a complete D&D session with encounters, story beats, and session flow",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    sessionTitle: z.string().describe("The title of the session"),
    sessionType: z
      .enum(["combat", "social", "exploration", "mixed"])
      .optional()
      .describe("Type of session to plan (default: mixed)"),
    estimatedDuration: z
      .number()
      .optional()
      .describe("Estimated session duration in hours (default: 4)"),
    focusAreas: z
      .array(z.string())
      .optional()
      .describe("Specific areas to focus on in this session"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      sessionTitle,
      sessionType = "mixed",
      estimatedDuration = 4,
      focusAreas,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[planSession] Using toolCallId:", toolCallId);

    console.log("[Tool] planSession received:", {
      campaignId,
      sessionTitle,
      sessionType,
      estimatedDuration,
      focusAreas,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] planSession - Environment found:", !!env);
      console.log("[Tool] planSession - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] planSession - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // Get campaign data for planning
        const characters = await env.DB.prepare(
          "SELECT * FROM campaign_characters WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .all();

        const resources = await env.DB.prepare(
          "SELECT * FROM campaign_resources WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .all();

        // Generate session plan
        const sessionPlan = generateSessionPlan(
          sessionTitle,
          sessionType,
          estimatedDuration,
          focusAreas,
          characters.results || [],
          resources.results || []
        );

        console.log("[Tool] Session plan generated:", sessionPlan.title);

        return createToolSuccess(
          `Session plan created: ${sessionPlan.title}`,
          {
            ...sessionPlan,
            campaignId,
            characters: characters.results?.length || 0,
            resources: resources.results?.length || 0,
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            campaignId,
            sessionTitle,
            sessionType,
            estimatedDuration,
            focusAreas,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to plan session",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Session plan created: ${result.title || sessionTitle}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error planning session:", error);
      return createToolError("Failed to plan session", error, 500, toolCallId);
    }
  },
});

// Tool to generate session hooks
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
    { campaignId, hookType = "opening", context: _contextParam, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[generateSessionHooks] Using toolCallId:", toolCallId);

    console.log("[Tool] generateSessionHooks received:", {
      campaignId,
      hookType,
      context,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] generateSessionHooks - Environment found:", !!env);
      console.log("[Tool] generateSessionHooks - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
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

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // Get campaign data for hook generation
        const characters = await env.DB.prepare(
          "SELECT * FROM campaign_characters WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .all();

        const resources = await env.DB.prepare(
          "SELECT * FROM campaign_resources WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .all();

        // Generate session hooks
        const hooks = generateHooks(
          hookType,
          context,
          characters.results || [],
          resources.results || []
        );

        console.log("[Tool] Generated hooks:", hooks.length);

        return createToolSuccess(
          `Generated ${hooks.length} ${hookType} hooks`,
          {
            hookType,
            hooks,
            totalCount: hooks.length,
            context: {
              characters: characters.results?.length || 0,
              resources: resources.results?.length || 0,
            },
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            campaignId,
            hookType,
            context,
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

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Generated ${result.hooks?.length || 0} ${hookType} hooks`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error generating session hooks:", error);
      return createToolError(
        "Failed to generate session hooks",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Helper function to generate session plan
function generateSessionPlan(
  title: string,
  type: string,
  duration: number,
  focusAreas: string[] = [],
  _characters: any[] = [],
  _resources: any[] = []
): any {
  const encounters = [];
  const storyBeats = [];

  // Generate encounters based on session type
  switch (type) {
    case "combat":
      encounters.push({
        type: "combat",
        title: "Main Combat Encounter",
        description: "A challenging combat scenario",
        estimatedTime: Math.floor(duration * 0.6),
        difficulty: "medium",
      });
      break;
    case "social":
      encounters.push({
        type: "social",
        title: "Social Interaction",
        description: "NPC dialogue and roleplay opportunities",
        estimatedTime: Math.floor(duration * 0.7),
        difficulty: "easy",
      });
      break;
    case "exploration":
      encounters.push({
        type: "exploration",
        title: "Exploration Sequence",
        description: "Discovering new areas and secrets",
        estimatedTime: Math.floor(duration * 0.8),
        difficulty: "easy",
      });
      break;
    default: // mixed
      encounters.push(
        {
          type: "social",
          title: "Opening Scene",
          description: "Session opening and setup",
          estimatedTime: Math.floor(duration * 0.2),
          difficulty: "easy",
        },
        {
          type: "combat",
          title: "Main Encounter",
          description: "Primary challenge of the session",
          estimatedTime: Math.floor(duration * 0.5),
          difficulty: "medium",
        },
        {
          type: "exploration",
          title: "Resolution",
          description: "Wrapping up and setting up next session",
          estimatedTime: Math.floor(duration * 0.3),
          difficulty: "easy",
        }
      );
  }

  // Generate story beats
  storyBeats.push(
    {
      title: "Session Opening",
      description: "Set the scene and establish the current situation",
      timing: "0-15 minutes",
    },
    {
      title: "Main Action",
      description: "The primary conflict or challenge of the session",
      timing: "15-75% of session",
    },
    {
      title: "Resolution",
      description: "Wrap up loose ends and set up next session",
      timing: "75-100% of session",
    }
  );

  return {
    title,
    type,
    estimatedDuration: duration,
    focusAreas,
    encounters,
    storyBeats,
    totalEncounters: encounters.length,
    totalStoryBeats: storyBeats.length,
  };
}

// Helper function to generate hooks
function generateHooks(
  type: string,
  _context: string = "",
  _characters: any[] = [],
  _resources: any[] = []
): any[] {
  const hooks = [];

  switch (type) {
    case "opening":
      hooks.push(
        {
          title: "Mysterious Message",
          description:
            "The party receives an urgent message from a mysterious source",
          setup: "A raven delivers a sealed letter with an urgent request",
          payoff: "The message leads to an important discovery or quest",
        },
        {
          title: "Unexpected Visitor",
          description: "An unexpected NPC arrives with important news",
          setup: "A familiar or new NPC appears with urgent information",
          payoff:
            "The visitor's information sets up the session's main conflict",
        }
      );
      break;
    case "transition":
      hooks.push({
        title: "Fork in the Road",
        description: "The party must choose between multiple paths",
        setup: "Present two or more equally compelling options",
        payoff: "Each choice leads to different consequences and opportunities",
      });
      break;
    case "cliffhanger":
      hooks.push({
        title: "Sudden Interruption",
        description: "Something unexpected interrupts the current situation",
        setup: "An alarm sounds, a messenger arrives, or danger appears",
        payoff: "The interruption creates urgency and drives the story forward",
      });
      break;
    case "resolution":
      hooks.push({
        title: "Revelation",
        description: "A hidden truth is revealed",
        setup: "Information that changes the party's understanding",
        payoff: "The revelation provides closure or sets up future sessions",
      });
      break;
  }

  return hooks;
}
