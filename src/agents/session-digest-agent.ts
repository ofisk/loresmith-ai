import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { sessionDigestTools } from "../tools/session-digest";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";
import {
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
  recordWorldEventTool,
} from "../tools/campaign-context/world-state-tools";
import { getDAOFactory } from "@/dao/dao-factory";
import { extractUsernameFromJwt } from "@/tools/utils";

/**
 * System prompt configuration for the Session Digest Agent.
 * Defines the agent's role in guiding users through session recap creation.
 */
const SESSION_DIGEST_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Session Digest Agent",
  responsibilities: [
    "Session Recap Creation: Guide users through creating comprehensive session recaps",
    "Structured Data Collection: Ask structured questions about key events, state changes, and open threads",
    "PC Spotlight Tracking: Track which player characters had the spotlight and ensure balanced rotation between PCs",
    "Individual Goal Progress: Monitor and record progress on each PC's personal goals and character arcs",
    "Arc Integration: Help connect individual character arcs to the larger main story arc",
    "World State Extraction: Extract and record world state changes from session recaps",
    "Planning Context: Help users plan for upcoming sessions with focus on PC goal advancement",
    "Incremental Building: Build session digests incrementally through conversation",
  ],
  tools: createToolMappingFromObjects({
    ...sessionDigestTools,
    updateEntityWorldStateTool,
    updateRelationshipWorldStateTool,
    recordWorldEventTool,
  }),
  workflowGuidelines: [
    "Conversation Style: Be friendly and conversational - guide users naturally through the recap process",
    "Structured Questions: Ask about key events, state changes (factions, locations, NPCs), and open threads",
    "Incremental Building: Build the digest incrementally - don't ask for everything at once",
    "World State Changes: When users mention state changes (e.g., 'the tavern burned down', 'NPC X died', 'faction Y allied with Z'), extract this information and use world state tools to record it",
    "Session Planning: Ask about next session plans, objectives, beats, and if-then branches",
    "Save Confirmation: Once you have gathered the minimum required information (session number, key events, and at least some planning context), ask the user: 'I have enough information to create the session digest. Should I save it now, or would you like to add more details?'",
    "Save When Confirmed: Only call createSessionDigestTool after the user explicitly confirms they want to save (e.g., 'yes', 'save it', 'that's good', 'go ahead')",
    "Continue Gathering: If the user wants to add more details, continue asking questions until they're ready to save",
    "Ask Follow-ups: If information is unclear, ask clarifying questions before asking for confirmation to save",
  ],
  importantNotes: [
    "CRITICAL - Campaign Context: The campaignId is automatically provided from the user's selected campaign. Always use the campaignId parameter when calling createSessionDigestTool - do NOT infer or guess the campaign ID from the user's message text. The campaignId is already available in the tool context.",
    "IMPORTANT: Always start by asking which session number this recap is for and what date the session occurred",
    "Date Parsing: When users provide relative dates like 'yesterday', 'last week', 'today', convert them to ISO date strings (YYYY-MM-DD format). For 'yesterday', calculate the date as one day before today. Always use the actual date, not the relative description.",
    "Key Events: Ask about the most important events that happened in the session",
    "State Changes: Specifically ask about changes to factions, locations, and NPCs - these are critical for world state tracking",
    "CRITICAL - NPC Format: When recording NPC state changes in state_changes.npcs, use STRINGS only (e.g., 'Guard Captain - deceased: fell in battle'). NEVER use objects. The format is: 'NPC Name - status: description'. Examples: ['Guard Captain - deceased: fell in battle'], ['Merchant - relocated: moved to neighboring town']",
    "Open Threads: Ask about unresolved plot threads or questions that came up",
    "Next Session Planning: Ask about DM objectives, probable player goals, planned beats, and if-then branches",
    "NPCs to Run: Ask which NPCs are likely to appear in the next session",
    "Locations in Focus: Ask which locations will be important next session",
    "Encounter Seeds: Ask about potential encounters or combat situations",
    "Clues and Revelations: Ask about clues that were dropped or revelations that occurred",
    "Treasure and Rewards: Ask about items, gold, or other rewards the party received",
    "Todo Checklist: Ask about any preparation tasks the DM needs to complete",
    "World State Integration: When users mention state changes, proactively use world state tools (updateEntityWorldStateTool, updateRelationshipWorldStateTool, recordWorldEventTool) to record them",
    "If the user mentions 'the party did X to location Y' or 'NPC Z died' or 'faction A allied with faction B', extract this and create changelog entries",
    "Don't wait for explicit requests - if state changes are mentioned, record them immediately",
    "Save Flow: After gathering minimum required information (session number + key events), ask for confirmation before saving",
    "Confirmation Examples: Ask 'Ready to save this session digest?' or 'Should I save this now?' and wait for user confirmation",
    "User Confirmation: Only call createSessionDigestTool after user explicitly confirms (yes, save it, go ahead, that's good, etc.)",
    "If user says 'not yet' or 'add more', continue gathering information",
    "If a digest already exists for the session number, inform the user and ask if they want to update it (which would require using updateSessionDigestTool instead)",
    "Be thorough but not overwhelming - break questions into natural conversation flow",
    "Minimum Required: At minimum, you need session number and at least one key event before asking to save",
  ],
});

/**
 * Session Digest Agent for LoreSmith AI.
 *
 * This agent specializes in guiding users through creating session digests by:
 * - Asking structured questions about session events
 * - Extracting world state changes from recaps
 * - Building comprehensive session digests incrementally
 * - Helping with session planning
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create a session digest agent instance
 * const digestAgent = new SessionDigestAgent(ctx, env, model);
 *
 * // Process a session recap request
 * await digestAgent.onChatMessage((response) => {
 *   console.log('Digest response:', response);
 * });
 * ```
 */
export class SessionDigestAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "session-digest",
    description:
      "Guides users through creating session recaps and planning information. Extracts world state changes and builds comprehensive session digests.",
    systemPrompt: SESSION_DIGEST_SYSTEM_PROMPT,
    tools: {
      ...sessionDigestTools,
      updateEntityWorldStateTool,
      updateRelationshipWorldStateTool,
      recordWorldEventTool,
    },
  };

  /**
   * Creates a new SessionDigestAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, {
      ...sessionDigestTools,
      updateEntityWorldStateTool,
      updateRelationshipWorldStateTool,
      recordWorldEventTool,
    });
  }

  /**
   * Override onChatMessage to add campaign context
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // Extract campaignId from the last user message if available
    const lastUserMessage = this.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user");

    let campaignId: string | null = null;
    if (lastUserMessage && "data" in lastUserMessage && lastUserMessage.data) {
      const messageData = lastUserMessage.data as { campaignId?: string };
      campaignId = messageData.campaignId || null;
    }

    // If we have a campaignId, fetch the campaign name and add it as context
    if (campaignId) {
      try {
        // Get JWT from last user message before filtering
        const jwt =
          lastUserMessage && "data" in lastUserMessage && lastUserMessage.data
            ? (lastUserMessage.data as { jwt?: string }).jwt
            : null;

        // Remove any existing campaign context messages to avoid stale data
        this.messages = this.messages.filter(
          (msg) =>
            !(
              msg.role === "system" &&
              typeof msg.content === "string" &&
              msg.content.includes("Campaign Context:")
            )
        );

        if (jwt) {
          const daoFactory = getDAOFactory(this.env as any);
          const userId = extractUsernameFromJwt(jwt);
          if (userId) {
            const campaign =
              await daoFactory.campaignDAO.getCampaignByIdWithMapping(
                campaignId,
                userId
              );
            if (campaign) {
              const contextMessage = `Campaign Context: You are creating a session digest for the campaign "${campaign.name}" (ID: ${campaignId}). Always use this campaignId when calling createSessionDigestTool.`;
              this.messages.push({
                role: "system",
                content: contextMessage,
              });
            }
          }
        }
      } catch (error) {
        console.error(
          "[SessionDigestAgent] Failed to fetch campaign context:",
          error
        );
        // Continue anyway - the campaignId will still be available in tool context
      }
    }

    // Now call the parent's onChatMessage with the enhanced context
    return super.onChatMessage(onFinish, options);
  }
}
