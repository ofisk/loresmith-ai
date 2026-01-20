import { z } from "zod";
import type { ToolResult } from "../app-constants";
import { getDAOFactory } from "../dao/dao-factory";

/**
 * Common tool parameter schemas
 */
export const commonSchemas = {
  jwt: z
    .string()
    .nullable()
    .optional()
    .describe("JWT token for authentication"),

  campaignId: z.string().describe("The unique identifier for the campaign"),

  username: z.string().describe("The username for authentication"),

  adminKey: z.string().describe("The admin key for authentication"),
};

/**
 * Extract username from JWT token
 */
export function extractUsernameFromJwt(jwt: string | null | undefined): string {
  if (!jwt) return "default";

  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    return payload.username || "default";
  } catch (error) {
    console.error("Error parsing JWT:", error);
    return "default";
  }
}

/**
 * Create authenticated headers for API requests
 */
export function createAuthHeaders(jwt?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
  };
}

/**
 * Get campaign name from campaignId (async helper for tools)
 */
export async function getCampaignName(
  campaignId: string | null | undefined,
  env: any,
  jwt: string | null | undefined
): Promise<string | null> {
  if (!campaignId || !env || !jwt) {
    return null;
  }

  try {
    const userId = extractUsernameFromJwt(jwt);
    if (!userId) {
      return null;
    }

    const daoFactory = getDAOFactory(env);
    const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userId
    );

    return campaign?.name || null;
  } catch (error) {
    console.error("[getCampaignName] Error fetching campaign name:", error);
    return null;
  }
}

/**
 * Format message with campaign context
 */
function formatMessageWithCampaign(
  message: string,
  campaignName: string | null | undefined
): string {
  if (!campaignName) {
    return message;
  }
  return `${message} for campaign "${campaignName}"`;
}

/**
 * Standard error response for tool execution
 */
export function createToolError(
  message: string,
  error: any,
  code: number,
  toolCallId: string,
  _campaignId?: string | null,
  campaignName?: string | null
): ToolResult {
  const formattedMessage = campaignName
    ? formatMessageWithCampaign(message, campaignName)
    : message;

  return {
    toolCallId,
    result: {
      success: false,
      message: formattedMessage,
      data: {
        error: error instanceof Error ? error.message : String(error),
        errorCode: code,
        ...(campaignName ? { campaignName } : {}),
      },
    },
  };
}

/**
 * Standard success response for tool execution
 */
export function createToolSuccess(
  message: string,
  data: any,
  toolCallId: string,
  _campaignId?: string | null,
  campaignName?: string | null
): ToolResult {
  const formattedMessage = campaignName
    ? formatMessageWithCampaign(message, campaignName)
    : message;

  return {
    toolCallId,
    result: {
      success: true,
      message: formattedMessage,
      data: {
        ...data,
        ...(campaignName ? { campaignName } : {}),
      },
    },
  };
}

/**
 * Execute API request with standard error handling
 */
export async function executeApiRequest(
  url: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if running in Durable Object context
 */
export function isDurableObjectContext(context?: any): boolean {
  return context?.env !== undefined;
}

/**
 * Get environment from context with fallback
 */
export function getEnvironment(context?: any): any {
  return context?.env || {};
}
