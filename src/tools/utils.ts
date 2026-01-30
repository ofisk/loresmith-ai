import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import type { ToolResult } from "../app-constants";
import { getDAOFactory } from "../dao/dao-factory";

/**
 * Minimal context passed to tool execute functions (e.g. from Durable Object).
 * env is set when running inside a Worker/DO; toolCallId may be set by the runtime.
 */
export interface ToolContext {
  env?: unknown;
  toolCallId?: string;
}

/**
 * Minimal env shape available from tool context (Worker/DO bindings).
 * Used so tools can safely access env.DB, env.VECTORIZE, etc. when present.
 */
export interface ToolEnv {
  DB?: D1Database;
  VECTORIZE?: unknown;
  OPENAI_API_KEY?: string;
  ADMIN_SECRET?: unknown;
  [key: string]: unknown;
}

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

/**
 * Get env from tool context (Durable Object or Worker). Returns null when not
 * running in a context that provides env, so callers can fall back to API.
 */
export function getEnvFromContext(context: unknown): ToolEnv | null {
  const c = context as { env?: unknown } | null | undefined;
  if (c?.env) return c.env as ToolEnv;
  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    return (globalThis as unknown as { env: unknown }).env as ToolEnv;
  }
  return null;
}

/**
 * Run tool logic with env (DB path) or API fallback.
 * If no env: calls apiCall() (e.g. authenticatedFetch).
 * If env: extracts userId from JWT; if missing returns authErrorResult; else calls dbCall(env, userId).
 */
export async function runWithEnvOrApi<T>(params: {
  context: unknown;
  jwt: string | null | undefined;
  apiCall: () => Promise<T>;
  dbCall: (env: unknown, userId: string) => Promise<T>;
  authErrorResult: T;
}): Promise<T> {
  const { context, jwt, apiCall, dbCall, authErrorResult } = params;
  const env = getEnvFromContext(context);

  if (!env) {
    return apiCall();
  }

  const userId = extractUsernameFromJwt(jwt);
  if (!userId) {
    return authErrorResult;
  }

  return dbCall(env, userId);
}
