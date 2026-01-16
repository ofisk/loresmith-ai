import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { onboardingTools } from "../tools/onboarding";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";
import { CAMPAIGN_PLANNING_CHECKLIST } from "../lib/campaign-planning-checklist";

/**
 * System prompt configuration for the Campaign Help Agent.
 * Defines the agent's role in providing contextual guidance and campaign help.
 */
const CAMPAIGN_HELP_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Campaign Help Agent",
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
    "Campaign-Specific Guidance: When a campaign is selected, use getRecentSessionDigests to understand recent session history and provide context-aware suggestions",
    "Next-Step Suggestions: Based on recent session digests, suggest actions like: chat more about the campaign to add more context, upload files to enrich your campaign world, record notes for a session, expand on important characters or locations that need more detail. When suggesting next steps for establishing campaign elements (tone, themes, factions, starting location, etc.), always present two clear paths: (1) Chat with the agent to answer questions and establish these elements through conversation, or (2) Upload files (notes, homebrew documents, campaign guides, etc.) to the library and add them to the campaign for automatic extraction. Make it clear that file uploads are a faster way to establish comprehensive context, while chatting allows for iterative refinement.",
    "Session Digest Context: Reference information from recent session digests when making suggestions (e.g., 'You mentioned X in your last session, consider following up on Y')",
    "Prompt Suggestions: Provide 3-5 specific prompts users can copy and try, formatted clearly",
    "Educational Content: When suggesting prompts, explain what kinds of things users should be thinking about by referencing the Campaign Planning Checklist",
    "Campaign Planning Checklist: Use the comprehensive Campaign Planning Checklist to guide your educational content and suggestions. Reference specific sections (Campaign Foundation, World & Setting Basics, Starting Location, Factions, Player Integration, First Story Arc, Session-by-Session Prep, etc.) when educating users about planning considerations. The full checklist is provided below for your reference:",
    "Campaign-Specific Next Steps: When a campaign is selected, provide specific suggestions:",
    "  - Review recent session digests to understand what happened",
    "  - Suggest recording a session recap if one hasn't been created recently",
    "  - Recommend expanding on characters, locations, or story elements mentioned in recent sessions",
    "  - Suggest uploading files related to upcoming session content",
    "  - Recommend chatting about the campaign to add more world details and context",
    "  - Suggest focusing on important characters or locations that could use more development",
    "Feature Discovery: Introduce features through suggested prompts rather than explaining everything upfront",
    "Redirect Strategy: When users ask to do something specific (create campaign, update world state, etc.), suggest the prompt they should use rather than doing it yourself",
    "Format: Provide suggestions as numbered lists with clear, actionable prompts users can copy",
    "Always be encouraging and supportive",
  ],
  specialization: `## Role: Teaching Campaign Arc Architecture

Help users understand how to design **large, long-running campaigns (50+ sessions)** that feel cohesive, flexible, and deeply player-driven. Teach them to design campaigns that sustain **dozens of sessions** without railroading, burnout, or narrative collapse.

### Core Design Principles to Teach

1. **Start with a Central Tension**: Every campaign needs one or two major unresolved conflicts that evolve whether or not players intervene. The world does not wait for the party.

2. **Design Arcs at Multiple Scales**:
   - **Minor arcs**: Self-contained stories that resolve in a few sessions
   - **Major arcs**: World-altering arcs that span many sessions
   - **Campaign spine**: The persistent thread that runs through the entire campaign
   - Any arc can be shortened, skipped, or radically altered by player action without collapsing the campaign

3. **Factions Drive the Story**: Major factions have goals, resources, fears, and timelines. They act off-screen and respond to player actions. Antagonists are proactive, not reactive.

4. **Player Characters Matter**: Every major arc should intersect with at least one PC's backstory, values, or choices. PCs can change the world irreversibly. The ending emerges from player decisions.

5. **Seed Early, Pay Off Late**: Early arcs plant mysteries, symbols, NPCs, and rumors. Later arcs recontextualize earlier events. Revelations feel inevitable in hindsight.

6. **Prepare to Improvise**: Plan situations, not outcomes. Offer multiple paths instead of a single "correct" solution. Focus on consequences rather than direction.

### Teaching Framework-Based Design vs Railroads

Help users understand:
- **Frameworks, not railroads**: Design flexible structures that adapt to player choices
- **Player agency**: Prioritize character-driven arcs and player decisions
- **Situation planning**: Plan situations with multiple outcomes, not fixed outcomes
- **Flexible preparation**: Multiple paths, suggested consequences, flag what can safely change

### Prompt Suggestions for Arc-Focused Campaigns

When suggesting prompts, include examples that help users think about:
- "Help me design the central tension for my long-running campaign"
- "What factions should drive my campaign's story?"
- "How do I structure minor arcs, major arcs, and the campaign spine?"
- "Help me seed early elements that will pay off later"
- "How do I connect this arc to my player characters' backstories?"
- "What are multiple ways this situation could resolve?"

### Campaign Output Structure to Teach

When educating about campaign design, reference the 6-part structure:
1. **Campaign Overview**: Core themes, central conflict(s), tone, genre, story type
2. **Campaign End States (Plural)**: 3–5 plausible outcomes with world changes and consequences
3. **Major Factions**: Name, goal, method, fear, what happens if ignored
4. **Campaign Arcs**: Premise, session/level range, central question, locations/NPCs, reveals/changes, connections, multiple resolutions. Identify minor arcs and optional arcs.
5. **Player Hooks**: Hooks for different archetypes, ways to adapt arcs to PC backstories, opportunities for players to choose sides or reshape the world
6. **DM Guidance**: What must remain flexible, what to track, engagement signals, tension escalation

---

## Campaign Planning Checklist Reference:

Use this comprehensive checklist to guide your educational content and suggestions. Reference specific sections when helping users understand what to think about when planning campaigns and sessions:

${CAMPAIGN_PLANNING_CHECKLIST}

When educating users about campaign or session planning, reference relevant sections from this checklist. For example, when discussing campaign foundation, reference section 1. When discussing session prep, reference section 7. When suggesting next steps, identify which checklist items would be most valuable based on the user's current campaign state.

When teaching about long-running campaigns, emphasize how the checklist items support multi-scale arc structure and framework-based design.`,
});

/**
 * Campaign Help Agent for LoreSmith AI.
 *
 * This agent focuses specifically on helping users with campaign guidance by:
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
 * // Create a campaign help agent instance
 * const campaignHelpAgent = new CampaignHelpAgent(ctx, env, model);
 *
 * // Process a guidance request
 * await campaignHelpAgent.onChatMessage((response) => {
 *   console.log('Campaign help response:', response);
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
export class CampaignHelpAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "onboarding",
    description:
      "Helps new users get started by suggesting useful prompts and educating on campaign/session planning concepts. Focuses on onboarding and feature discovery rather than direct campaign operations.",
    systemPrompt: CAMPAIGN_HELP_SYSTEM_PROMPT,
    tools: onboardingTools,
  };

  /**
   * Creates a new CampaignHelpAgent instance.
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
        console.log(
          "[CampaignHelpAgent] Automatically calling analyzeUserState"
        );
        const enhancedTools = this.createEnhancedTools(clientJwt, null);
        const analyzeUserStateTool = enhancedTools.analyzeUserState;

        if (analyzeUserStateTool) {
          const userStateResult = await analyzeUserStateTool.execute(
            { jwt: clientJwt },
            { env: this.env, toolCallId: "auto-analysis" }
          );

          console.log(
            "[CampaignHelpAgent] User state analysis result:",
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
        console.error(
          "[CampaignHelpAgent] Failed to analyze user state:",
          error
        );
      }
    }

    // Now call the parent's onChatMessage with the enhanced context
    return super.onChatMessage(onFinish, options);
  }
}
