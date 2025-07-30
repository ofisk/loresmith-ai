import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult, USER_MESSAGES } from "../../constants";
import { createToolError, createToolSuccess } from "../utils";

// General authentication tools

export const setAdminSecret = tool({
  description: "Validate and store the admin key for PDF upload functionality",
  parameters: z.object({
    adminKey: z.string().describe("The admin key provided by the user"),
    username: z.string().describe("The username provided by the user"),
    openaiApiKey: z
      .string()
      .optional()
      .describe("Optional OpenAI API key provided by the user"),
  }),
  execute: async (
    { adminKey, username, openaiApiKey },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] setAdminSecret received:", { username });
    console.log("[Tool] setAdminSecret context:", context);
    try {
      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[setAdminSecret] Environment from context:", !!env);
      console.log(
        "[setAdminSecret] ADMIN_SECRET binding exists:",
        env?.ADMIN_SECRET !== undefined
      );

      if (env?.ADMIN_SECRET) {
        console.log(
          "[setAdminSecret] Running in Durable Object context, calling server directly"
        );

        // Validate admin key directly
        const validAdminKey = env.ADMIN_SECRET || "undefined-admin-key";
        console.log(
          "[setAdminSecret] Validating admin key against:",
          validAdminKey
        );

        if (adminKey !== validAdminKey) {
          return createToolError(USER_MESSAGES.INVALID_ADMIN_KEY, {
            authenticated: false,
          });
        }

        // Generate JWT token
        const jwt = require("jsonwebtoken");
        const token = jwt.sign(
          { username, authenticated: true },
          validAdminKey,
          { expiresIn: "24h" }
        );

        console.log(
          "[setAdminSecret] Admin key validated successfully for user:",
          username
        );

        return createToolSuccess(USER_MESSAGES.ADMIN_KEY_VALIDATED, {
          authenticated: true,
          token,
        });
      } else {
        // Fall back to HTTP API
        console.log(
          "[setAdminSecret] Running in HTTP context, making API request"
        );
        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              providedKey: adminKey,
              username,
              ...(openaiApiKey && { openaiApiKey }),
            }),
          }
        );

        const result = (await response.json()) as {
          success: boolean;
          authenticated: boolean;
          error?: string;
          token?: string;
        };

        if (result.success && result.authenticated) {
          return createToolSuccess(USER_MESSAGES.ADMIN_KEY_VALIDATED, {
            authenticated: true,
            token: result.token,
          });
        }
        return createToolError(USER_MESSAGES.INVALID_ADMIN_KEY, {
          authenticated: false,
        });
      }
    } catch (error) {
      console.error("Error validating admin key:", error);
      return createToolError(`Error validating admin key: ${error}`, {
        authenticated: false,
      });
    }
  },
});
