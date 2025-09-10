import { campaignContextTools } from "../tools/campaign-context";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

/**
 * System prompt configuration for the Campaign Context Agent.
 * Defines the agent's role in analyzing and managing campaign context.
 */
const CAMPAIGN_CONTEXT_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Campaign Context Agent",
  responsibilities: [
    "Character Management: Create, store, and manage character information and backstories",
    "Context Storage: Store and retrieve campaign context like world descriptions, session notes, and plot hooks",
    "AI Character Generation: Create detailed characters with AI-generated backstories, personalities, and relationships",
    "Context Search: Help users find relevant campaign context and character information",
    "Campaign Assessment: Analyze campaign readiness and provide scoring across narrative, character, plot hooks, and session readiness",
    "File Analysis: Extract campaign information from uploaded module files and integrate into campaign context",
    "Module Integration: Parse published modules and extract key story elements, NPCs, locations, and plot hooks",
  ],
  tools: createToolMappingFromObjects(campaignContextTools),
  workflowGuidelines: [
    "Character Creation: When users want to create characters, offer to use the createCharacter tool for AI-powered generation",
    "Context Storage: Help users store important campaign information like backstories, world details, and session notes",
    "Information Retrieval: Help users find relevant context and character information when needed",
    "AI Enhancement: Use AI to generate rich character details, backstories, and personality traits",
    "Campaign Analysis: When users ask about campaign readiness or need guidance, use assessment tools to provide detailed analysis",
    "File Processing: When users upload module files, extract key story elements and integrate them into campaign context",
    "Module Integration: Parse module structure, extract NPCs, locations, plot hooks, and story beats for campaign context",
  ],
  importantNotes: [
    "Always store character information using storeCharacterInfo tool",
    "Store detailed backstories using storeCampaignContext tool",
    "Offer to create characters using AI with createCharacter tool",
    "Ask for character name, class, race, and level",
    "Use AI to generate compelling backstories and personality traits",
    "Create meaningful relationships with other party members",
    "Store all character information for future reference",
    "Help users organize campaign information by type (character_backstory, world_description, session_notes, etc.)",
    "Provide intelligent suggestions based on stored context",
    "Maintain consistency across campaign information",
    "When analyzing campaigns, provide detailed scoring across narrative, character, plot hooks, and session readiness",
    "Extract key information from uploaded module files including NPCs, locations, plot hooks, and story structure",
    "Integrate module content with existing campaign context to create comprehensive campaign understanding",
    "Provide actionable recommendations based on campaign assessment scores",
    "Focus on high-impact areas when providing campaign improvement suggestions",
    "When users mention files, guide them to add files to campaigns from their library to extract shards and enhance planning capabilities",
    "Never ask for technical details like campaign IDs - guide users through the natural workflow instead",
  ],
});

/**
 * Campaign Context Agent for LoreSmith AI.
 *
 * This agent specializes in managing and analyzing campaign context, including:
 * - Character creation and management with AI-generated content
 * - Campaign context storage and retrieval
 * - World building and session note management
 * - Intelligent context analysis and suggestions
 * - Campaign readiness assessment and scoring
 * - File module analysis and integration
 *
 * The agent uses AI to generate rich character backstories, personalities, and
 * relationships, while also helping users organize and retrieve campaign information
 * like world descriptions, session notes, and plot hooks. It can analyze campaign
 * health across multiple dimensions and extract information from uploaded module files.
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create a campaign context agent instance
 * const contextAgent = new CampaignContextAgent(ctx, env, model);
 *
 * // Process a context-related message
 * await contextAgent.onChatMessage((response) => {
 *   console.log('Context response:', response);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // The agent can handle various context tasks:
 * // - "Create a character named Thorin, a dwarf fighter"
 * // - "Store this world description"
 * // - "Find information about the Black Dragon"
 * // - "Generate a backstory for my character"
 * // - "Analyze my campaign's readiness"
 * // - "Extract information from this uploaded module file"
 * ```
 */
export class CampaignContextAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "campaign-context",
    description:
      "Manages character backstories, player characters, NPCs, character motivations, personality traits, and character context information.",
    systemPrompt: CAMPAIGN_CONTEXT_SYSTEM_PROMPT,
    tools: campaignContextTools,
  };

  /**
   * Creates a new CampaignContextAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, campaignContextTools);
  }
}
