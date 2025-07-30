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
    "Contextual Guidance: Provide personalized suggestions based on user state and campaign health",
    "Campaign Assessment Integration: Use campaign health scores to provide targeted recommendations",
    "External Tool Recommendations: Suggest helpful resources like DMsGuild, D&D Beyond, Pinterest, etc.",
    "Progressive Onboarding: Guide users through inspiration gathering, campaign creation, and session planning",
    "Help System: Provide ongoing assistance through the 'Help Me' feature",
  ],
  tools: createToolMappingFromObjects(onboardingTools),
  workflowGuidelines: [
    "User State Analysis: Always analyze user's current state before providing guidance",
    "Campaign-Aware Suggestions: Use campaign health assessments to provide targeted recommendations",
    "Progressive Disclosure: Don't overwhelm users with all features at once",
    "Action-Oriented Guidance: Always suggest specific next actions users can take",
    "External Resource Integration: Recommend relevant external tools and resources",
    "Contextual Help: Provide different guidance based on whether user has campaigns, resources, etc.",
  ],
  importantNotes: [
    "Always start by analyzing the user's current state (first-time, existing campaigns, resources, etc.)",
    "For first-time users, explain the app's three core pillars: inspiration library, campaign context, session planning",
    "For users with existing campaigns, use campaign health assessments to provide targeted guidance",
    "Suggest specific actions users can take immediately (upload resources, create campaigns, etc.)",
    "Recommend external tools that are relevant to the user's current needs",
    "Focus on high-impact areas when providing campaign improvement suggestions",
    "Provide different guidance for empty state vs. resource-rich state",
    "Always be encouraging and supportive, especially for new users",
    "Use campaign health scores to prioritize which areas need attention",
    "Suggest tools like DMsGuild, D&D Beyond, Pinterest, Reddit, YouTube based on user needs",
  ],
});

/**
 * Onboarding & Guidance Agent for LoreSmith AI.
 *
 * This agent serves as the primary "concierge" for users, providing contextual
 * guidance based on their current state and needs. It analyzes user state, campaign
 * health, and provides personalized recommendations for next steps.
 *
 * The agent can handle various scenarios:
 * - First-time users: Welcome and explain core features
 * - Empty state: Guide toward inspiration gathering
 * - Existing campaigns: Provide targeted improvement suggestions
 * - Resource-rich state: Guide toward campaign creation and session planning
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
 * ```
 */
export class OnboardingAgent extends BaseAgent {
  /**
   * Creates a new OnboardingAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, onboardingTools, ONBOARDING_SYSTEM_PROMPT);
  }
}
