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

// Tool to get campaign suggestions
export const getCampaignSuggestions = tool({
  description:
    "Get intelligent suggestions for campaign development, session planning, and story progression",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    suggestionType: z
      .enum(["session", "character", "plot", "world", "combat"])
      .optional()
      .describe("Type of suggestions to generate (default: session)"),
    context: z
      .string()
      .optional()
      .describe("Additional context for generating suggestions"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, suggestionType = "session", context: contextParam, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[getCampaignSuggestions] Using toolCallId:", toolCallId);

    console.log("[Tool] getCampaignSuggestions received:", {
      campaignId,
      suggestionType,
      context,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] getCampaignSuggestions - Environment found:", !!env);
      console.log("[Tool] getCampaignSuggestions - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] getCampaignSuggestions - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
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

        // Get campaign data for context
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

        // Generate suggestions based on type and available data
        const suggestions = generateSuggestions(
          suggestionType,
          characters.results || [],
          resources.results || [],
          context
        );

        console.log("[Tool] Generated suggestions:", suggestions.length);

        return createToolSuccess(
          `Generated ${suggestions.length} ${suggestionType} suggestions`,
          {
            suggestionType,
            suggestions,
            totalCount: suggestions.length,
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
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.SUGGESTIONS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            suggestionType,
            context,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to get campaign suggestions",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Generated ${result.suggestions?.length || 0} ${suggestionType} suggestions`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error getting campaign suggestions:", error);
      return createToolError(
        "Failed to get campaign suggestions",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Tool to assess campaign readiness
export const assessCampaignReadiness = tool({
  description:
    "Assess the campaign's readiness for the next session and provide recommendations",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    assessmentType: z
      .enum(["session", "story", "characters", "world"])
      .optional()
      .describe("Type of readiness assessment (default: session)"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, assessmentType = "session", jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[assessCampaignReadiness] Using toolCallId:", toolCallId);

    console.log("[Tool] assessCampaignReadiness received:", {
      campaignId,
      assessmentType,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] assessCampaignReadiness - Environment found:", !!env);
      console.log("[Tool] assessCampaignReadiness - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] assessCampaignReadiness - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
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

        // Get campaign data for assessment
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

        const context = await env.DB.prepare(
          "SELECT * FROM campaign_context WHERE campaign_id = ?"
        )
          .bind(campaignId)
          .all();

        // Perform assessment
        const assessment = performReadinessAssessment(
          assessmentType,
          characters.results || [],
          resources.results || [],
          context.results || []
        );

        console.log("[Tool] Assessment completed:", assessment.score);

        return createToolSuccess(
          `Campaign readiness assessment completed (Score: ${assessment.score}/100)`,
          {
            assessmentType,
            score: assessment.score,
            status: assessment.status,
            recommendations: assessment.recommendations,
            details: assessment.details,
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.READINESS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            assessmentType,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to assess campaign readiness",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Campaign readiness assessment completed (Score: ${result.score}/100)`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error assessing campaign readiness:", error);
      return createToolError(
        "Failed to assess campaign readiness",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Helper function to generate suggestions
function generateSuggestions(
  type: string,
  _characters: any[],
  _resources: any[],
  _context?: string
): any[] {
  const suggestions = [];

  switch (type) {
    case "session":
      suggestions.push(
        {
          title: "Plan a Combat Encounter",
          description:
            "Design an engaging combat scenario based on your party composition",
          priority: "high",
          estimatedTime: "30 minutes",
        },
        {
          title: "Create Social Interaction",
          description: "Develop NPC interactions and dialogue opportunities",
          priority: "medium",
          estimatedTime: "20 minutes",
        }
      );
      break;
    case "character":
      suggestions.push({
        title: "Character Development Arc",
        description: "Plan character growth and story progression",
        priority: "high",
        estimatedTime: "25 minutes",
      });
      break;
    case "plot":
      suggestions.push({
        title: "Main Story Advancement",
        description: "Move the main plot forward with key story beats",
        priority: "high",
        estimatedTime: "40 minutes",
      });
      break;
    default:
      suggestions.push({
        title: "General Session Planning",
        description:
          "Prepare a well-rounded session with multiple encounter types",
        priority: "medium",
        estimatedTime: "45 minutes",
      });
  }

  return suggestions;
}

// Helper function to perform readiness assessment
function performReadinessAssessment(
  type: string,
  characters: any[],
  resources: any[],
  context: any[]
): any {
  let score = 0;
  const recommendations = [];

  // Basic scoring based on available data
  if (characters.length > 0) score += 20;
  if (resources.length > 0) score += 20;
  if (context.length > 0) score += 20;

  // Type-specific scoring
  switch (type) {
    case "session":
      if (characters.length >= 3) score += 20;
      if (resources.length >= 2) score += 20;
      break;
    case "story":
      if (context.length >= 3) score += 30;
      if (characters.length >= 2) score += 20;
      break;
    case "characters":
      if (characters.length >= 2) score += 40;
      break;
    case "world":
      if (context.length >= 5) score += 40;
      break;
  }

  // Cap score at 100
  score = Math.min(score, 100);

  // Generate recommendations
  if (score < 50) {
    recommendations.push("Add more campaign context and resources");
  }
  if (characters.length < 2) {
    recommendations.push("Create more character profiles");
  }
  if (resources.length < 2) {
    recommendations.push("Add more campaign resources");
  }

  return {
    score,
    status: score >= 70 ? "ready" : score >= 50 ? "needs_work" : "not_ready",
    recommendations,
    details: {
      characters: characters.length,
      resources: resources.length,
      context: context.length,
    },
  };
}
