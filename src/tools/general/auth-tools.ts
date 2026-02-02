import { tool } from "ai";
import { z } from "zod";
import {
  API_CONFIG,
  type ToolResult,
  USER_MESSAGES,
} from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import {
  createToolError,
  createToolSuccess,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";

const validateAdminKeySchema = z.object({
  adminKey: z.string().describe("The admin key to validate"),
  jwt: z
    .string()
    .nullable()
    .optional()
    .describe("JWT token for authentication"),
});

// Tool to validate admin key
export const validateAdminKey = tool({
  description:
    "Validate the admin key for accessing file upload and processing features",
  inputSchema: validateAdminKeySchema,
  execute: async (
    input: z.infer<typeof validateAdminKeySchema>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { adminKey, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[validateAdminKey] Using toolCallId:", toolCallId);

    console.log("[Tool] validateAdminKey received:", {
      adminKey: adminKey ? "***" : "not provided",
    });

    try {
      const env = getEnvFromContext(options);
      console.log("[Tool] validateAdminKey - Environment found:", !!env);
      console.log("[Tool] validateAdminKey - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        // Validate admin key against stored value
        const storedKey = env.ADMIN_SECRET || process.env.ADMIN_SECRET;

        if (!storedKey) {
          console.error("[validateAdminKey] No admin key configured");
          return createToolError(
            USER_MESSAGES.INVALID_ADMIN_SECRET,
            "Admin secret not configured",
            500,
            toolCallId
          );
        }

        if (adminKey === storedKey) {
          console.log("[validateAdminKey] Admin key validated successfully");
          return createToolSuccess(
            USER_MESSAGES.ADMIN_SECRET_VALIDATED,
            { authenticated: true },
            toolCallId
          );
        } else {
          console.log("[validateAdminKey] Invalid admin key provided");
          return createToolError(
            USER_MESSAGES.INVALID_ADMIN_SECRET,
            "Invalid admin secret",
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
          USER_MESSAGES.INVALID_ADMIN_SECRET,
          `HTTP ${response.status}: ${await response.text()}`,
          401,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        USER_MESSAGES.ADMIN_SECRET_VALIDATED,
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
