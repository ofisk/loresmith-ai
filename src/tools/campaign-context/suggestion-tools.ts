import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../../constants";
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

// Tool to get intelligent suggestions based on campaign context
export const getIntelligentSuggestions = tool({
  description:
    "Get intelligent suggestions for campaign planning based on stored context, character information, and available resources",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    suggestionType: z
      .enum([
        "session_planning",
        "resource_recommendations",
        "plot_hooks",
        "character_development",
        "world_building",
        "npc_suggestions",
        "encounter_ideas",
        "general_planning",
      ])
      .describe("The type of suggestions to generate"),
    specificFocus: z
      .string()
      .optional()
      .describe(
        "Specific focus area for suggestions (e.g., 'combat encounters', 'social interactions')"
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, suggestionType, specificFocus, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] getIntelligentSuggestions received:", {
      campaignId,
      suggestionType,
      specificFocus,
    });
    console.log("[Tool] getIntelligentSuggestions context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log(
        "[getIntelligentSuggestions] Environment from context:",
        !!env
      );
      console.log(
        "[getIntelligentSuggestions] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[getIntelligentSuggestions] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = extractUsernameFromJwt(jwt);
        console.log("[getIntelligentSuggestions] User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError("Campaign not found", "Campaign not found");
        }

        // For now, return a simple response since this would require AI processing
        // In a real implementation, this would analyze campaign context and generate suggestions
        console.log(
          "[getIntelligentSuggestions] Generating suggestions for type:",
          suggestionType
        );

        return createToolSuccess(
          `Generated 3 intelligent suggestions for ${suggestionType}`,
          {
            suggestions: [
              {
                type: suggestionType,
                title: "Sample suggestion 1",
                description:
                  "This is a sample suggestion based on campaign context",
                priority: "high",
              },
              {
                type: suggestionType,
                title: "Sample suggestion 2",
                description: "Another sample suggestion for campaign planning",
                priority: "medium",
              },
              {
                type: suggestionType,
                title: "Sample suggestion 3",
                description: "A third sample suggestion for campaign planning",
                priority: "low",
              },
            ],
            campaignId,
            suggestionType,
            specificFocus,
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[getIntelligentSuggestions] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.SUGGESTIONS(campaignId)
          ),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              suggestionType,
              specificFocus,
            }),
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(authError, null, AUTH_CODES.INVALID_KEY);
          }
          return createToolError(
            `Failed to get intelligent suggestions: ${response.status}`,
            `HTTP ${response.status}`
          );
        }

        const result = (await response.json()) as any;
        return createToolSuccess(
          `Generated ${result.suggestions?.length || 0} intelligent suggestions for ${suggestionType}`,
          result
        );
      }
    } catch (error) {
      console.error("Error getting intelligent suggestions:", error);
      return createToolError(
        `Failed to get intelligent suggestions: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  },
});

// Tool to assess campaign readiness and suggest next steps
export const assessCampaignReadiness = tool({
  description:
    "Assess the current state of campaign planning and suggest what additional information or resources would be helpful",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] assessCampaignReadiness received:", { campaignId });
    console.log("[Tool] assessCampaignReadiness context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvFromContext(context);
      console.log("[assessCampaignReadiness] Environment from context:", !!env);
      console.log(
        "[assessCampaignReadiness] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[assessCampaignReadiness] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        const userId = extractUsernameFromJwt(jwt);
        console.log("[assessCampaignReadiness] User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError("Campaign not found", "Campaign not found");
        }

        // For now, return a simple assessment
        // In a real implementation, this would analyze campaign data and provide detailed assessment
        console.log(
          "[assessCampaignReadiness] Assessing campaign readiness for:",
          campaignId
        );

        return createToolSuccess("Campaign readiness assessment completed", {
          readinessLevel: "moderate",
          missingElements: [
            "Character backstories",
            "World description",
            "Session notes",
          ],
          recommendations: [
            "Add character backstories for better roleplay",
            "Include world description for immersion",
            "Document session notes for continuity",
          ],
          campaignId,
        });
      } else {
        // Fall back to HTTP API
        console.log(
          "[assessCampaignReadiness] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.READINESS(campaignId)
          ),
          {
            method: "GET",
            jwt,
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(authError, null, AUTH_CODES.INVALID_KEY);
          }
          return createToolError(
            `Failed to assess campaign readiness: ${response.status}`,
            `HTTP ${response.status}`
          );
        }

        const result = (await response.json()) as any;
        return createToolSuccess(
          `Campaign readiness assessment: ${result.readinessLevel || "unknown"}`,
          result
        );
      }
    } catch (error) {
      console.error("Error assessing campaign readiness:", error);
      return createToolError(
        `Failed to assess campaign readiness: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  },
});
