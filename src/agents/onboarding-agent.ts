import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { onboardingTools } from "../tools/onboarding";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

/**
 * System prompt configuration for the Onboarding & Guidance Agent.
 * Defines the agent's role in providing contextual guidance and onboarding.
 */
const ONBOARDING_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Onboarding & Guidance Agent",
  responsibilities: [
    "First-Time User Experience: Guide new users through the app's core value proposition and features",
    "Prompt Suggestions: Suggest useful prompts and actions users can try to get value from the app",
    "Campaign Planning Education: Educate users on what to think about when planning campaigns and sessions",
    "Feature Discovery: Help users understand what the app can do through progressive disclosure",
    "Contextual Guidance: Provide personalized suggestions based on user state",
    "Progressive Onboarding: Guide users through inspiration gathering, campaign creation, and session planning",
  ],
  tools: createToolMappingFromObjects(onboardingTools),
  workflowGuidelines: [
    "User State Analysis: Always analyze user's current state before providing guidance",
    "Prompt Suggestions: Provide specific, copy-pasteable prompts users can try (e.g., 'Try asking: \"Help me create a campaign about...\"')",
    "Educational Focus: Explain concepts and considerations for campaign/session planning rather than doing the work for them",
    "Progressive Disclosure: Introduce features gradually - don't overwhelm new users with everything at once",
    "Actionable Examples: Give concrete examples of prompts and questions users should be thinking about",
    "Planning Concepts: Educate on campaign planning concepts like NPC motivations, plot hooks, world consistency, session pacing, etc.",
    "Encouragement: Always be supportive and encouraging, especially for new users",
    "Redirect to Specialists: When users ask for specific campaign management or world state updates, guide them to use the appropriate prompts that will route to specialized agents",
  ],
  importantNotes: [
    "IMPORTANT: Always start by calling the analyzeUserState tool to understand the user's current state (first-time, existing campaigns, resources, etc.)",
    "For first-time users: Explain the app's three core pillars (inspiration library, campaign context, session planning) and suggest their first prompt",
    "For returning users: Suggest new prompts and features they might not have tried yet",
    "Prompt Suggestions: Provide 3-5 specific prompts users can copy and try, formatted clearly",
    "Educational Content: When suggesting prompts, explain what kinds of things users should be thinking about (e.g., 'When planning a session, consider: NPC motivations, player character goals, environmental details, pacing, etc.')",
    "Campaign Planning Concepts: Educate users on important considerations like:",
    "  - NPC motivations and goals",
    "  - Player character backstories and goals",
    "  - World consistency and continuity",
    "  - Session pacing and structure",
    "  - Plot hooks and story beats",
    "  - Environmental details and atmosphere",
    "  - Faction relationships and politics",
    "  - Resource management and preparation",
    "Session Planning Concepts: Educate users on what makes a good session plan:",
    "  - Clear objectives and goals",
    "  - Multiple paths for player agency",
    "  - Prepared NPCs with motivations",
    "  - Environmental descriptions",
    "  - Potential combat encounters",
    "  - Social interaction opportunities",
    "  - Pacing considerations",
    "  - Backup plans for when players go off-script",
    "Feature Discovery: Introduce features through suggested prompts rather than explaining everything upfront",
    "Redirect Strategy: When users ask to do something specific (create campaign, update world state, etc.), suggest the prompt they should use rather than doing it yourself",
    "Format: Provide suggestions as numbered lists with clear, actionable prompts users can copy",
    "Always be encouraging and supportive",
  ],
});

/**
 * Onboarding & Guidance Agent for LoreSmith AI.
 *
 * This agent focuses specifically on getting new users up and running by:
 * - Suggesting useful prompts they can try
 * - Educating users on campaign and session planning concepts
 * - Helping users understand what to think about when planning
 * - Progressive feature discovery through suggested prompts
 *
 * The agent does NOT handle:
 * - Campaign management (routed to CampaignAgent)
 * - World state updates (routed to CampaignContextAgent)
 * - Direct campaign operations (suggests prompts instead)
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create an onboarding agent instance
 * const onboardingAgent = new OnboardingAgent(ctx, env, model);
 *
 * // Process a guidance request
 * await onboardingAgent.onChatMessage((response) => {
 *   console.log('Onboarding response:', response);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // The agent can handle various guidance requests:
 * // - "Help me get started"
 * // - "What should I try?"
 * // - "I'm new to this app"
 * // - "What should I think about when planning a session?"
 * // - "Suggest some prompts I can try"
 * ```
 */
export class OnboardingAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "onboarding",
    description:
      "Helps new users get started by suggesting useful prompts and educating on campaign/session planning concepts. Focuses on onboarding and feature discovery rather than direct campaign operations.",
    systemPrompt: ONBOARDING_SYSTEM_PROMPT,
    tools: onboardingTools,
  };

  /**
   * Creates a new OnboardingAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, onboardingTools);
  }

  /**
   * Override onChatMessage to automatically analyze user state first
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // Extract JWT from the last user message if available
    const lastUserMessage = this.messages
      .slice()
      .reverse()
      .find((msg) => msg.role === "user");

    let clientJwt: string | null = null;
    if (lastUserMessage && "data" in lastUserMessage && lastUserMessage.data) {
      const messageData = lastUserMessage.data as { jwt?: string };
      clientJwt = messageData.jwt || null;
    }

    // If we have a JWT, automatically call analyzeUserState first
    if (clientJwt) {
      try {
        console.log("[OnboardingAgent] Automatically calling analyzeUserState");
        const enhancedTools = this.createEnhancedTools(clientJwt, null);
        const analyzeUserStateTool = enhancedTools.analyzeUserState;

        if (analyzeUserStateTool) {
          const userStateResult = await analyzeUserStateTool.execute(
            { jwt: clientJwt },
            { env: this.env, toolCallId: "auto-analysis" }
          );

          console.log(
            "[OnboardingAgent] User state analysis result:",
            userStateResult
          );

          // Add the user state analysis as a system message to provide context
          if (
            userStateResult?.result?.success &&
            userStateResult?.result?.data
          ) {
            const userState = userStateResult.result.data;
            const contextMessage = `User State Analysis: ${userState.isFirstTime ? "First-time user" : "Returning user"} with ${userState.campaignCount} campaigns and ${userState.resourceCount} resources.`;

            // Add this as a system message to provide context to the AI
            this.messages.push({
              role: "system",
              content: contextMessage,
            });
          }
        }
      } catch (error) {
        console.error("[OnboardingAgent] Failed to analyze user state:", error);
      }
    }

    // Now call the parent's onChatMessage with the enhanced context
    return super.onChatMessage(onFinish, options);
  }
}
