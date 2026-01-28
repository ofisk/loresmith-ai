import { characterManagementTools } from "../tools/campaign-context/character-tools-bundle";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";

/**
 * System prompt configuration for the Character Agent.
 * Focused on character management and generation.
 */
const CHARACTER_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Character Agent",
  responsibilities: [
    "Character Management: Create, store, and manage character information and backstories",
    "AI Character Generation: Create detailed characters with AI-generated backstories, personalities, and relationships",
  ],
  tools: createToolMappingFromObjects(characterManagementTools),
  workflowGuidelines: [
    "Character Creation: When users want to create characters, use storeCharacterInfo to store basic character information",
    "AI Generation: When users want AI-generated character details, use generateCharacterWithAITool to create rich backstories, personalities, and traits",
    "Character Storage: Always store character information using storeCharacterInfo tool for future reference",
    "CRITICAL - Duplicate Detection on Creation: When storing character info, ALWAYS check the tool response for duplicateFound: true in the data field. If a duplicate is found, you MUST inform the user that a character with that name already exists and ask if they want to update the existing character instead of creating a duplicate. Do NOT create a duplicate without asking the user first.",
    "CRITICAL - Duplicate Consolidation: When users ask to consolidate or remove duplicates: (1) If the user specifies a particular character to delete (e.g., 'delete the [character name]', 'the [character name] needs to be deleted', 'remove the [metadata] [name]'), use searchCampaignContext to search for that specific character (e.g., query='[character name]') and identify it by matching any class/type mentioned. Extract the REAL entityId from the search results and use deleteEntityTool to delete it. (2) If the user asks to consolidate all duplicates without specifying which ones (e.g., 'consolidate duplicates', 'remove duplicates'), use listAllEntities with entityType='pcs' to get all player characters and check the 'duplicates' field in the response. Extract the REAL entityIds from the results (NOT placeholders - use the actual 'id' field), identify which entity should be kept (usually the one with the most complete information or the most recent), and use deleteEntityTool for each duplicate to delete. Always confirm which entities you're deleting before deleting them. After deletion, verify by re-querying to confirm duplicates are gone. NEVER use placeholder IDs - always extract real IDs from search results.",
  ],
  importantNotes: [
    "Always store character information using storeCharacterInfo tool",
    "Offer to create characters using AI with generateCharacterWithAITool for rich backstories",
    "Ask for character name, class, race, and level when creating characters",
    "Use AI to generate compelling backstories and personality traits",
    "Check for duplicate characters before creating - if a character with the same name exists, ask the user if they want to update it instead",
    "When users ask to delete or remove characters, use deleteEntityTool - do NOT try to create or update the character. First search for the character using listAllEntities or searchCampaignContext to get the real entity ID, then delete it.",
  ],
});

/**
 * Character Agent for LoreSmith AI.
 *
 * This agent specializes in character management and generation, including:
 * - Character creation and storage
 * - AI-generated character backstories, personalities, and relationships
 *
 * The agent helps users create and manage characters with AI-generated content,
 * storing character information for future reference and campaign planning.
 *
 * @extends BaseAgent - Inherits common agent functionality
 */
export class CharacterAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "character",
    description:
      "Manages character creation, storage, and AI-generated character backstories, personalities, and relationships.",
    systemPrompt: CHARACTER_SYSTEM_PROMPT,
    tools: characterManagementTools,
  };

  /**
   * Creates a new CharacterAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, characterManagementTools);
  }
}
