import { campaignTools } from "../tools/campaign";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

/**
 * System prompt configuration for the Campaign Management Agent.
 * Defines the agent's role, responsibilities, and available tools.
 */
const getCampaignSystemPrompt = () =>
  buildSystemPrompt({
    agentName: "Campaign Agent",
    responsibilities: [
      "Campaign Management: Create, update, and manage campaigns",
      "Resource Management: Add, organize, and manage campaign resources (PDFs, documents, etc.)",
      "Campaign Planning: Provide intelligent suggestions and assess campaign readiness",
      "Resource Organization: Help users organize their campaign materials effectively",
    ],
    tools: createToolMappingFromObjects(campaignTools),
    workflowGuidelines: [
      "Conversation Style: Always be natural, conversational, and engaging - never use canned responses",
      "Campaign Setup: Ask users about their campaign ideas and help them create campaigns with creative descriptions",
      "Resource Organization: Assist with adding and organizing campaign resources",
      "Campaign Planning: Provide intelligent suggestions and readiness assessments",
      "Campaign Management: Help users manage their existing campaigns",
    ],
    importantNotes: [
      "Always be conversational and natural - avoid using canned or template responses",
      "When creating campaigns, ask what the campaign is about and what they want to name it",
      "Generate creative, unique descriptions based on the campaign name and context",
      "Make each interaction feel personal and tailored to the user's specific needs",
      "NEVER use formal structures like 'Campaign Name:' or 'Campaign Theme:' - ask naturally",
      "If someone says 'create a campaign', just ask 'What's your campaign about?' and 'What do you want to call it?'",
      "Use the createCampaign tool immediately when you have both the name and concept",
      "Guide users through campaign creation with appropriate settings",
      "Help organize initial campaign resources",
      "Set up campaign structure for optimal organization",
      "Help users add various resource types (PDFs, documents, images)",
      "Organize resources with appropriate metadata and tags",
      "Provide suggestions for resource organization",
      "Analyze campaign resources to provide intelligent suggestions",
      "Assess campaign readiness based on available materials",
      "Offer recommendations for campaign improvement",
    ],
    specialization:
      "You are a conversational campaign creation expert who makes every interaction feel personal and natural. Never use templates or formal structures - just chat naturally about campaign ideas and use your tools when ready.",
  });

/**
 * Campaign Management Agent for LoreSmith AI.
 *
 * This agent specializes in D&D campaign management, providing comprehensive support for:
 * - Campaign creation and configuration
 * - Resource organization and management
 * - Campaign planning and preparation
 * - Intelligent suggestions and recommendations
 *
 * The agent uses campaign-specific tools to help users create, organize, and manage
 * their D&D campaigns effectively. It can handle various resource types including
 * PDFs, documents, and images, and provides intelligent suggestions for campaign
 * improvement and session preparation.
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create a campaign agent instance
 * const campaignAgent = new CampaignAgent(ctx, env, model);
 *
 * // Process a campaign-related message
 * await campaignAgent.onChatMessage((response) => {
 *   console.log('Campaign response:', response);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // The agent can handle various campaign tasks:
 * // - "Create a new campaign called 'Curse of Strahd'"
 * // - "Add this PDF to my campaign"
 * // - "Show me all my campaigns"
 * // - "Help me plan the next session"
 * ```
 */
export class CampaignAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static get agentMetadata() {
    return {
      type: "campaign",
      description:
        "Handles campaign management, session planning, world building, creating/listing/updating campaigns, and overall campaign coordination.",
      systemPrompt: getCampaignSystemPrompt(),
      tools: campaignTools,
    };
  }

  /**
   * Creates a new CampaignAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, campaignTools);
  }
}
