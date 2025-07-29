import { characterSheetTools } from "../tools/characterSheet";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./systemPrompts";

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

export class CharacterSheetAgent extends BaseAgent {
  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, characterSheetTools, CHARACTER_SHEET_SYSTEM_PROMPT);
  }
}
