import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { onboardingTools } from "../tools/onboarding";
import { campaignTools } from "../tools/campaign";
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
    "Contextual Guidance: Provide personalized suggestions based on user state and campaign readiness",
    "Campaign Development Analysis: Analyze user's current campaign state and progress",
    "Personalized Recommendations: Provide specific, actionable next steps based on user context",
    "Resource Suggestions: Recommend relevant resources, tools, and external content",
    "Progress Encouragement: Motivate users to continue developing their campaigns",
    "Campaign Assessment Integration: Use campaign readiness scores to provide targeted recommendations",
    "External Tool Recommendations: Suggest helpful resources like DMsGuild, D&D Beyond, Pinterest, etc.",
    "Progressive Onboarding: Guide users through inspiration gathering, campaign creation, and session planning",
    "Help System: Provide ongoing assistance through the 'Help Me' feature",
  ],
  tools: createToolMappingFromObjects({ ...onboardingTools, ...campaignTools }),
  workflowGuidelines: [
    "User State Analysis: Always analyze user's current state before providing guidance",
    "Campaign-Aware Suggestions: Use campaign readiness assessments to provide targeted recommendations",
    "Analysis First: Always analyze the user's current state before providing recommendations",
    "Be Specific: Provide concrete, actionable suggestions rather than generic advice",
    "Encourage Growth: Focus on ways to expand and enrich existing campaigns",
    "Resource Discovery: Suggest specific resources and where to find them",
    "Session Planning: Help users plan their next game sessions with specific content",
    "Progressive Disclosure: Don't overwhelm users with all features at once",
    "Action-Oriented Guidance: Always suggest specific next actions users can take",
    "External Resource Integration: Recommend relevant external tools and resources",
    "Contextual Help: Provide different guidance based on whether user has campaigns, resources, etc.",
  ],
  importantNotes: [
    "IMPORTANT: Always start by calling the analyzeUserState tool to understand the user's current state (first-time, existing campaigns, resources, etc.)",
    "Always analyze the user's current campaigns, resources, and recent activity",
    "Provide 3-5 specific, actionable recommendations tailored to their situation",
    "Suggest both immediate next steps and longer-term development opportunities",
    "Include specific resource recommendations (DMsGuild, DriveThruRPG, etc.)",
    "Encourage shard development by suggesting ways to expand on existing content",
    "Offer session planning assistance for active campaigns",
    "For first-time users, explain the app's three core pillars: inspiration library, campaign context, session planning",
    "For users with existing campaigns, use campaign readiness assessments to provide targeted guidance",
    "Suggest specific actions users can take immediately (upload resources, create campaigns, etc.)",
    "Recommend external tools that are relevant to the user's current needs",
    "Focus on high-impact areas when providing campaign improvement suggestions",
    "Provide different guidance for empty state vs. resource-rich state",
    "Always be encouraging and supportive, especially for new users",
    "Use campaign readiness scores to prioritize which areas need attention",
    "Suggest tools like DMsGuild, D&D Beyond, Pinterest, Reddit, YouTube based on user needs",
    "Format recommendations as numbered, actionable items with clear next steps",
  ],
});

/**
 * Onboarding & Guidance Agent for LoreSmith AI.
 *
 * This agent serves as the primary "concierge" for users, providing contextual
 * guidance based on their current state and needs. It analyzes user state, campaign
 * health, and provides personalized recommendations for next steps.
 *
 * The agent combines onboarding capabilities with campaign-specific guidance:
 * - First-time users: Welcome and explain core features
 * - Empty state: Guide toward inspiration gathering
 * - Existing campaigns: Provide targeted improvement suggestions
 * - Resource-rich state: Guide toward campaign creation and session planning
 * - Campaign development: Analyze campaign state and provide specific next steps
 * - Session planning: Help users plan their next game sessions
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
 * // - "What should I do next?"
 * // - "I'm new to this app"
 * // - "Help me improve my campaign"
 * // - "What tools should I use?"
 * // - "Plan my next session"
 * // - "Analyze my campaign readiness"
 * ```
 */
export class OnboardingAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "onboarding",
    description:
      "Provides contextual guidance, onboarding, campaign development analysis, and help for new and existing users.",
    systemPrompt: ONBOARDING_SYSTEM_PROMPT,
    tools: { ...onboardingTools, ...campaignTools },
  };

  /**
   * Creates a new OnboardingAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, { ...onboardingTools, ...campaignTools });
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
