import { isGMRole } from "@/constants/campaign-roles";
import {
	characterManagementTools,
	playerCharacterTools,
} from "@/tools/campaign-context/character-tools-bundle";
import type { CampaignRole } from "@/types/campaign";
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
		"AI Generation: When users want AI-generated character details, use generateCharacterWithAITool. It pulls classes, species, and rules from the campaign graph—system-agnostic.",
		"Needs Clarification: If generateCharacterWithAITool returns needsClarification in the data, the campaign has no character rules indexed. Ask the user the suggestedQuestions from the response, or suggest they upload rulebooks / add house rules. If the user says 'yes, invent options' or similar, call the tool again with allowInventIfNoRules: true.",
		"Character Storage: Always store character information using storeCharacterInfo tool for future reference",
		"CRITICAL - Duplicate Detection on Creation: When storing character info, check the tool response for duplicateFound: true and duplicateEntityId. If the user explicitly asked to update or change the character (e.g. 'update her class from Monk to Fighter'), call updateCharacterInfo immediately with the duplicateEntityId and the new fields (e.g. characterClass: 'Fighter'). If the user was trying to create a new character and a duplicate was found, ask if they want to update the existing character instead; if yes, use updateCharacterInfo with duplicateEntityId and the provided details. Do NOT create a duplicate without asking.",
		"CRITICAL - Duplicate Consolidation: When users ask to consolidate or remove duplicates: (1) If the user specifies a particular character to delete, use searchCampaignContext to search for that character and identify it by matching any class/type mentioned. Extract the real entityId from search results and use deleteEntityTool. (2) If the user asks to consolidate all duplicates without specifying which ones, use listAllEntities with entityType='pcs' to get all player characters and check the 'duplicates' field. Extract the real entityIds from results (NOT placeholders - use the actual 'id' field), identify which entity should be kept (usually the most complete or most recent), and use deleteEntityTool for each duplicate. Always confirm which entities you're deleting before deleting. After deletion, verify by re-querying. NEVER use placeholder IDs - always extract real IDs from search results.",
		"When users ask to pull or use details from a specific document or file, use getDocumentContent with the file name to retrieve the indexed text, then use that content to populate or update the character.",
	],
	importantNotes: [
		"Always store character information using storeCharacterInfo tool",
		"Offer to create characters using AI with generateCharacterWithAITool for rich backstories",
		"Character creation uses campaign rules (classes, species) from the entity graph—no default game system. If the campaign has no rules, ask the user to add them or use allowInventIfNoRules when they grant permission.",
		"Ask for character name, class/role, species, and level when creating characters",
		"To change an existing character's details (e.g. class, level, race): use updateCharacterInfo with the entity's ID (from duplicateEntityId when storeCharacterInfo found a duplicate, or from listAllEntities/searchCampaignContext) and the updated fields. Check for duplicates before creating; if one exists and the user wants to update, use updateCharacterInfo.",
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

	protected getToolsForRole(role: CampaignRole | null): Record<string, any> {
		return isGMRole(role) ? characterManagementTools : playerCharacterTools;
	}
}
