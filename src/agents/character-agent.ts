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
  ],
  importantNotes: [
    "Always store character information using storeCharacterInfo tool",
    "Offer to create characters using AI with generateCharacterWithAITool for rich backstories",
    "Ask for character name, class, race, and level when creating characters",
    "Use AI to generate compelling backstories and personality traits",
    "Check for duplicate characters before creating - if a character with the same name exists, ask the user if they want to update it instead",
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
