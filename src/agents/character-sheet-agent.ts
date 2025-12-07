import { characterSheetTools } from "../tools/character-sheet";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";

/**
 * System prompt configuration for the Character Sheet Agent.
 * Defines the agent's role in managing character sheet files and data.
 */
const CHARACTER_SHEET_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Character Sheet Agent",
  responsibilities: [
    "File Management: Upload and process character sheet files (PDF, Word docs, etc.)",
    "Character Creation: Create characters from uploaded files or chat input",
    "File Processing: Extract character data from uploaded files",
    "Character Organization: Help users organize and manage their character sheets",
  ],
  tools: createToolMappingFromObjects(characterSheetTools),
  workflowGuidelines: [
    "File Upload: Help users upload character sheet files and generate upload URLs",
    "File Processing: Process uploaded files to extract character data",
    "Character Creation: Create characters from information provided in chat",
    "Organization: Help users manage and organize their character sheets",
  ],
  importantNotes: [
    "Help users upload character sheet files with uploadCharacterSheet tool",
    "Process uploaded files with processCharacterSheet tool",
    "Create characters from chat information with createCharacterFromChat tool",
    "List and organize character sheets with listCharacterSheets tool",
    "Accept various file formats (PDF, DOCX, DOC, TXT, JSON)",
    "Generate secure upload URLs for files",
    "Process files to extract character information",
    "Store character data in the campaign",
    "Extract character information from user messages",
    "Create structured character data",
    "Store characters in the appropriate campaign",
    "Provide confirmation and details",
    "List all character sheets for a campaign",
    "Help users organize their character files",
    "Provide information about uploaded files and their status",
  ],
});

/**
 * Character Sheet Agent for LoreSmith AI.
 *
 * This agent specializes in character sheet management and processing, including:
 * - File upload and processing for character sheets
 * - Character data extraction from various file formats
 * - Character creation from chat input
 * - Character sheet organization and management
 *
 * The agent can handle multiple file formats (PDF, DOCX, DOC, TXT, JSON) and
 * extract character information from uploaded files or create characters directly
 * from user input. It provides secure upload URLs and processes files to extract
 * structured character data for storage in campaigns.
 *
 * @extends BaseAgent - Inherits common agent functionality
 *
 * @example
 * ```typescript
 * // Create a character sheet agent instance
 * const characterAgent = new CharacterSheetAgent(ctx, env, model);
 *
 * // Process a character sheet-related message
 * await characterAgent.onChatMessage((response) => {
 *   console.log('Character sheet response:', response);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // The agent can handle various character sheet tasks:
 * // - "Upload my character sheet PDF"
 * // - "Create a character from this information"
 * // - "Show me all my character sheets"
 * // - "Process the uploaded character file"
 * ```
 */
export class CharacterSheetAgent extends BaseAgent {
  /** Agent metadata for registration and routing */
  static readonly agentMetadata = {
    type: "character-sheets",
    description:
      "Handles character sheet uploads, imports, management, listing, and character sheet file operations.",
    systemPrompt: CHARACTER_SHEET_SYSTEM_PROMPT,
    tools: characterSheetTools,
  };

  /**
   * Creates a new CharacterSheetAgent instance.
   *
   * @param ctx - The Durable Object state for persistence
   * @param env - The environment containing Cloudflare bindings
   * @param model - The AI model instance for generating responses
   */
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, characterSheetTools);
  }
}
