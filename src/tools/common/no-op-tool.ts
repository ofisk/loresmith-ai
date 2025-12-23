import { tool } from "ai";
import { z } from "zod";
import { createToolSuccess } from "../utils";

/**
 * No-op tool that allows the agent to explicitly opt out of using any actual tools.
 *
 * This tool should be used when:
 * - The agent can answer the user's question directly without needing to call any tools
 * - The query doesn't require any tool-based operations
 * - The agent wants to provide a conversational response without tool assistance
 *
 * IMPORTANT: Only use this tool when you are CERTAIN that no other tool is needed.
 * If there's any doubt, prefer using the appropriate tool (e.g., searchCampaignContext
 * for entity queries, listCampaigns for campaign listings, etc.).
 */
export const noOpTool = tool({
  description: `A no-op tool that allows you to explicitly opt out of using any actual tools when you can answer the user's question directly without tool assistance. 

Use this tool ONLY when:
- You can answer the question from the conversation context alone
- No tool-based operations are needed (no searches, no data retrieval, no updates)
- You're providing a purely conversational response

DO NOT use this tool if:
- The user asks about entities "from my campaign", "in my world", or similar phrases → use searchCampaignContext
- The user asks to list, create, or manage campaigns → use the appropriate campaign tool
- The user asks about files or resources → use the appropriate file/resource tool
- You need to search, retrieve, or update any data → use the appropriate tool

When in doubt, use the appropriate tool rather than this no-op tool.`,
  parameters: z.object({
    reason: z
      .string()
      .describe(
        "Brief explanation of why no tool is needed (e.g., 'Answering a general question that doesn't require data access')"
      ),
  }),
  execute: async ({ reason }): Promise<any> => {
    return createToolSuccess(
      `No tool needed: ${reason}`,
      { optedOut: true, reason },
      "no-op"
    );
  },
});
