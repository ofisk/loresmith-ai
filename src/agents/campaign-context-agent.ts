import { campaignContextTools } from "../tools/campaignContext";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

const CAMPAIGN_CONTEXT_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Campaign Context Agent",
  responsibilities: [
    "Character Management: Create, store, and manage character information and backstories",
    "Context Storage: Store and retrieve campaign context like world descriptions, session notes, and plot hooks",
    "AI Character Generation: Create detailed characters with AI-generated backstories, personalities, and relationships",
    "Context Search: Help users find relevant campaign context and character information",
  ],
  tools: createToolMappingFromObjects(campaignContextTools),
  workflowGuidelines: [
    "Character Creation: When users want to create characters, offer to use the createCharacter tool for AI-powered generation",
    "Context Storage: Help users store important campaign information like backstories, world details, and session notes",
    "Information Retrieval: Help users find relevant context and character information when needed",
    "AI Enhancement: Use AI to generate rich character details, backstories, and personality traits",
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
  ],
});

export class CampaignContextAgent extends BaseAgent {
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(
      ctx,
      env,
      model,
      campaignContextTools,
      CAMPAIGN_CONTEXT_SYSTEM_PROMPT
    );
  }
}
