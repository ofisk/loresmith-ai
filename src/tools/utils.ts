import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../constants";

/**
 * Common tool parameter schemas
 */
export const commonSchemas = {
  jwt: z
    .string()
    .nullable()
    .describe("JWT token for authentication (required for all operations)"),

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
 * Standard error response for tool execution
 */
export function createToolError(
  message: string,
  error?: any,
  code: number = AUTH_CODES.ERROR
): ToolResult {
  return {
    code,
    message,
    data: { error: error instanceof Error ? error.message : String(error) },
  };
}

/**
 * Standard success response for tool execution
 */
export function createToolSuccess(message: string, data: any = {}): ToolResult {
  return {
    code: AUTH_CODES.SUCCESS,
    message,
    data,
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
