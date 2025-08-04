import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult, USER_MESSAGES } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
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

// Tool to validate admin key
export const validateAdminKey = tool({
  description:
    "Validate the admin key for accessing PDF upload and processing features",
  parameters: z.object({
    adminKey: z.string().describe("The admin key to validate"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ adminKey, jwt }, context?: any): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[validateAdminKey] Using toolCallId:", toolCallId);

    console.log("[Tool] validateAdminKey received:", {
      adminKey: adminKey ? "***" : "not provided",
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] validateAdminKey - Environment found:", !!env);
      console.log("[Tool] validateAdminKey - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        // Validate admin key against stored value
        const storedKey = env.ADMIN_KEY || process.env.ADMIN_KEY;

        if (!storedKey) {
          console.error("[validateAdminKey] No admin key configured");
          return createToolError(
            USER_MESSAGES.INVALID_ADMIN_KEY,
            "Admin key not configured",
            500,
            toolCallId
          );
        }

        if (adminKey === storedKey) {
          console.log("[validateAdminKey] Admin key validated successfully");
          return createToolSuccess(
            USER_MESSAGES.ADMIN_KEY_VALIDATED,
            { authenticated: true },
            toolCallId
          );
        } else {
          console.log("[validateAdminKey] Invalid admin key provided");
          return createToolError(
            USER_MESSAGES.INVALID_ADMIN_KEY,
            "Invalid admin key",
            401,
            toolCallId
          );
        }
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            providedKey: adminKey,
            validateAdmin: true,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          USER_MESSAGES.INVALID_ADMIN_KEY,
          `HTTP ${response.status}: ${await response.text()}`,
          401,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        USER_MESSAGES.ADMIN_KEY_VALIDATED,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error validating admin key:", error);
      return createToolError(
        `Error validating admin key: ${error}`,
        error,
        500,
        toolCallId
      );
    }
  },
});
