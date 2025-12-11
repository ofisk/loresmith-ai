import { tool } from "ai";
import { z } from "zod";
import {
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "@/tools/utils";
import { getDAOFactory } from "@/dao/dao-factory";
import type { ToolResult } from "@/app-constants";
import { validateSessionDigestData } from "@/types/session-digest";
import type { SessionDigestData } from "@/types/session-digest";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";

const generateDigestSchema = z.object({
  campaignId: z.string().describe("The campaign ID"),
  sessionNumber: z
    .number()
    .int()
    .positive()
    .describe("The session number (e.g., 1, 2, 3)"),
  sessionDate: z
    .string()
    .optional()
    .nullable()
    .describe(
      "ISO date string for the session date (YYYY-MM-DD format). Convert relative dates like 'yesterday' to actual dates."
    ),
  notes: z
    .string()
    .min(1)
    .describe(
      "Unstructured text notes about the session to generate digest from"
    ),
  templateId: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Optional template ID to use as a guide for the digest structure"
    ),
  jwt: z.string().optional().describe("JWT token for authentication"),
});

export const generateDigestFromNotesTool = tool({
  description:
    "Generate a structured session digest from unstructured session notes. This uses AI to extract key events, state changes, planning information, and other digest fields from raw text. Returns a draft digest ready for review before saving.",
  parameters: generateDigestSchema,
  execute: async (
    { campaignId, sessionNumber, sessionDate, notes, templateId, jwt },
    context?: any
  ): Promise<ToolResult> => {
    const toolCallId = context?.toolCallId || crypto.randomUUID();

    try {
      if (!jwt) {
        return createToolError(
          "Authentication required",
          "JWT token is required",
          401,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const env = context?.env;
      if (!env) {
        return createToolError(
          "Environment not available",
          "Server environment is required",
          500,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);

      // Verify campaign exists and user has access
      const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
        campaignId,
        userId
      );

      if (!campaign) {
        return createToolError(
          "Campaign not found",
          "Campaign not found or access denied",
          404,
          toolCallId
        );
      }

      // Check if digest already exists for this session
      const existing =
        await daoFactory.sessionDigestDAO.getSessionDigestByCampaignAndSession(
          campaignId,
          sessionNumber
        );

      if (existing) {
        return createToolError(
          "Session digest already exists",
          `A session digest already exists for session ${sessionNumber}. Use updateSessionDigestTool to modify it, or create a digest for a different session number.`,
          409,
          toolCallId
        );
      }

      // Get template if provided
      let templateData: SessionDigestData | null = null;
      if (templateId) {
        const template =
          await daoFactory.sessionDigestTemplateDAO.getTemplateById(templateId);
        if (template && template.campaignId === campaignId) {
          templateData = template.templateData;
        }
      }

      // Get OpenAI API key
      const openaiApiKey =
        env.OPENAI_API_KEY || (await daoFactory.getOpenAIKey(userId));

      if (!openaiApiKey) {
        return createToolError(
          "OpenAI API key required",
          "An OpenAI API key is required for digest generation. Please provide one in your settings.",
          400,
          toolCallId
        );
      }

      // Build prompt for LLM
      const prompt = buildGenerationPrompt(
        notes,
        campaign.name,
        sessionNumber,
        sessionDate,
        templateData
      );

      // Create LLM provider and generate structured output
      const llmProvider = createLLMProvider({
        provider: "openai",
        apiKey: openaiApiKey,
        defaultModel: "gpt-4o",
        defaultTemperature: 0.3,
        defaultMaxTokens: 4000,
      });

      console.log(
        `[generateDigestFromNotesTool] Generating digest for session ${sessionNumber} from ${notes.length} characters of notes`
      );

      const generatedDigest =
        await llmProvider.generateStructuredOutput<SessionDigestData>(prompt, {
          model: "gpt-4o",
          temperature: 0.3,
          maxTokens: 4000,
        });

      // Validate the generated digest
      if (!validateSessionDigestData(generatedDigest)) {
        console.error(
          "[generateDigestFromNotesTool] Generated digest failed validation",
          generatedDigest
        );
        return createToolError(
          "Generation failed validation",
          "The AI-generated digest did not match the required schema. Please try again or create the digest manually.",
          500,
          toolCallId
        );
      }

      return createToolSuccess(
        `Generated session digest for session ${sessionNumber}. Review the digest below and use createSessionDigestTool to save it, or ask me to make changes.`,
        {
          digestData: generatedDigest,
          sessionNumber,
          sessionDate: sessionDate || null,
          generatedByAi: true,
          status: "draft",
          sourceType: "ai_generated",
          templateId: templateId || null,
        },
        toolCallId,
        campaignId,
        campaign.name
      );
    } catch (error) {
      console.error("[generateDigestFromNotesTool] Error:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return createToolError(
        "Failed to generate digest",
        errorMessage,
        500,
        toolCallId
      );
    }
  },
});

/**
 * Build a prompt for generating a session digest from unstructured notes
 */
function buildGenerationPrompt(
  notes: string,
  campaignName: string,
  sessionNumber: number,
  sessionDate: string | null | undefined,
  templateData: SessionDigestData | null
): string {
  const dateInfo = sessionDate
    ? `Session date: ${sessionDate}`
    : "Session date not provided";

  let templateGuidance = "";
  if (templateData) {
    templateGuidance = `\n\nUse the following template as a guide for structure and style, but adapt the content to match the actual session notes:\n${JSON.stringify(templateData, null, 2)}`;
  }

  return `You are generating a structured session digest for a D&D/TTRPG campaign from unstructured session notes.

Campaign: ${campaignName}
Session Number: ${sessionNumber}
${dateInfo}

Session Notes:
${notes}
${templateGuidance}

Extract and organize the following information into a structured session digest JSON format:

1. **last_session_recap**:
   - **key_events**: Array of strings describing the most important events that happened in this session (e.g., "The party discovered a hidden chamber beneath the tavern", "NPC X revealed their true identity")
   - **state_changes**: Object with three arrays:
     - **factions**: Changes to faction relationships, alliances, or conflicts (e.g., "Thieves' Guild - hostile: party exposed their operation")
     - **locations**: Changes to locations, buildings, or places (e.g., "Old Mill - destroyed: burned down during the confrontation")
     - **npcs**: Changes to NPCs in the format "NPC Name - status: description" (e.g., "Guard Captain - deceased: fell in battle protecting the town", "Merchant - relocated: moved to neighboring town")
   - **open_threads**: Array of strings describing unresolved plot threads or questions raised (e.g., "Who is the mysterious figure watching the party?", "What happened to the missing artifact?")

2. **next_session_plan**:
   - **objectives_dm**: Array of strings describing what the DM wants to accomplish next session
   - **probable_player_goals**: Array of strings predicting what the players will likely try to do
   - **beats**: Array of strings describing planned story beats or scenes
   - **if_then_branches**: Array of strings describing conditional scenarios (e.g., "If players investigate the ruins, reveal ancient inscriptions")

3. **npcs_to_run**: Array of NPC names that are likely to appear or be important in the next session

4. **locations_in_focus**: Array of location names that will be important or visited next session

5. **encounter_seeds**: Array of strings describing potential combat encounters or challenges

6. **clues_and_revelations**: Array of strings describing clues that were dropped or revelations that occurred

7. **treasure_and_rewards**: Array of strings describing items, gold, or other rewards the party received

8. **todo_checklist**: Array of strings describing preparation tasks the DM needs to complete before next session

Important guidelines:
- Extract information from the notes - do not invent details that aren't mentioned
- Be specific and concrete rather than vague
- Use clear, concise language
- For state_changes.npcs, use the format "NPC Name - status: description"
- If information isn't available in the notes for a particular field, use an empty array []
- Focus on actionable information that will help with session planning and campaign continuity

Return ONLY valid JSON matching this exact structure:
{
  "last_session_recap": {
    "key_events": [],
    "state_changes": {
      "factions": [],
      "locations": [],
      "npcs": []
    },
    "open_threads": []
  },
  "next_session_plan": {
    "objectives_dm": [],
    "probable_player_goals": [],
    "beats": [],
    "if_then_branches": []
  },
  "npcs_to_run": [],
  "locations_in_focus": [],
  "encounter_seeds": [],
  "clues_and_revelations": [],
  "treasure_and_rewards": [],
  "todo_checklist": []
}`;
}
