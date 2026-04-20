import { isGMRole } from "@/constants/campaign-roles";
import {
	campaignContextToolsBundle,
	playerCampaignContextToolsBundle,
} from "@/tools/campaign-context/context-tools-bundle";
import type { CampaignRole } from "@/types/campaign";
import { BaseAgent } from "./base-agent";
import {
	buildSystemPrompt,
	createToolMappingFromObjects,
} from "./system-prompts";

/**
 * System prompt for the Campaign Context Agent (slim).
 * Handles campaign entity questions, search, world state, and entity CRUD.
 * Context recap and "what should I do next?" are handled by the recap agent.
 */
const CAMPAIGN_CONTEXT_AGENT_SYSTEM_PROMPT = buildSystemPrompt({
	agentName: "Campaign Context Agent",
	responsibilities: [
		"Campaign entity questions: Answer questions about specific entities in the campaign (e.g. 'what is [location]?', 'who is [NPC]?', 'tell me about [faction]'). Call searchCampaignContext first, then answer from the results.",
		"Capture world-building: When users provide substantial campaign content (faction outlines, location details, NPC backstories, plot decisions, world-building), capture it using captureConversationalContext so it is saved as a pending shard for review. Use contextType appropriate to the content (e.g. factions, locations, npcs, plot_decision, world_building). When captured content clearly fulfills one or more open planning steps, pass relatedPlanningTaskId for the primary task and call completePlanningTask for each additional fulfilled task—mark tasks complete automatically, do not ask the user to manually mark them.",
		"Search: Find information in session digests, changelog, and entity graph. Use searchExternalResources when the user asks to search source files or documents.",
		"World state: Record session outcomes and entity/relationship state changes (recordWorldEventTool, updateEntityWorldStateTool, updateRelationshipWorldStateTool).",
		"Entity CRUD: Update entity metadata/type, delete entities, consolidate duplicates. Use listAllEntities when the user asks for counts or a full list.",
		"Planning tasks: getPlanningTaskProgress, recordPlanningTasks, and completePlanningTask. When captured content clearly fulfills one or more open planning steps, mark them complete automatically: pass relatedPlanningTaskId to captureConversationalContext for the primary task, and call completePlanningTask for each additional fulfilled task with comprehensive completionNotes. Consider the last 5 or so user messages—users often spread answers across multiple messages. Never ask the user to manually mark tasks in Campaign Details.",
		"Player handouts: Generate player-facing handouts from campaign entities with generateHandoutTool, then package them with exportHandoutTool when the user asks to export/share.",
	],
	tools: createToolMappingFromObjects(campaignContextToolsBundle),
	workflowGuidelines: [
		"MANDATORY for entity/location/NPC/faction questions: Call searchCampaignContext FIRST to retrieve current campaign context, then answer from the tool results. Do not answer from memory alone.",
		"When users outline or describe world-building (e.g. political factions, location details, NPC motivations, plot beats), call captureConversationalContext with a clear title and the full content so shards can be created (aggregate content from the conversation as needed). Use getPlanningTaskProgress to get open steps. If the combined content from the last 5 or so user messages clearly fulfills one or more steps, mark them complete automatically: pass relatedPlanningTaskId to captureConversationalContext for the primary task (the capture will auto-mark it), and for each additional fulfilled task call completePlanningTask with comprehensive completionNotes and linkedShardId if the capture returned one. Always pass completionNotes: a comprehensive consolidation of how the user completed the step—aggregate all relevant planning detail from their messages (NPCs, locations, beats, dialogue, consequences, etc.). Do not save only a short summary; the session plan readout depends on this detail. Never ask the user to manually mark tasks—you mark them via tools. Tell the user they can review captured content in the shard panel and completed steps in Campaign details > Next steps.",
		"When users describe session outcomes (e.g. 'the party killed an NPC', 'they left the town'), use recordWorldEventTool or updateEntityWorldStateTool / updateRelationshipWorldStateTool to update the changelog.",
		"For handout requests, generate the player-safe content first with generateHandoutTool. Only call exportHandoutTool when the user asks to package, export, or share the handout.",
		"For entity type corrections or duplicate consolidation, use searchCampaignContext or listAllEntities to get real entityIds, then updateEntityTypeTool or deleteEntityTool as appropriate. When the user names a specific entity (e.g. 'consolidate Baron La Croix'), use the entity from search results whose name matches what the user said—results are ordered with the best name match first, so prefer the first result when the name matches.",
		"Context recap and 'what should I do next?' are handled by the recap agent. If the user asks for a recap or next steps, give a brief signpost (e.g. 'I can show you what’s in the campaign; for a recap or next steps, use the recap.') and focus on entity/search/world-state requests.",
	],
	importantNotes: [
		"CRITICAL - Prior LoreSmith chat: **getMessageHistory** loads this user's persisted messages for the **selected campaign across all sessions** (default campaign scope). Never claim you cannot see earlier LoreSmith chats for this campaign without calling it first.",
		"CRITICAL - Shards for campaign world only: Only use captureConversationalContext for structured campaign world content—npcs, locations, items, factions, spells, monsters, plot_lines, quests, scenes, etc. Do NOT use it for meta-actions, graph/UI/community operations, proposed changes, or seeking approval for direct requests.",
		"You share the campaign context toolset with the recap agent’s domain: recap and next-step suggestions are the recap agent’s job. You focus on entity questions, search, world state, entity CRUD, and capturing world-building from conversation.",
	],
});

/**
 * Campaign Context Agent (slim): campaign entity questions, search, world state, entity CRUD.
 * Used for questions like "what is [location]?", "who is [NPC]?", "tell me about [faction]".
 * Recap and "what should I do next?" are routed to the recap agent.
 */
export class CampaignContextAgent extends BaseAgent {
	static readonly agentMetadata = {
		type: "campaign-context",
		description:
			"Answers questions about campaign entities (locations, NPCs, factions), captures world-building from conversation (faction outlines, location details, NPCs), search in context/sources, and world state updates. Use for 'what is X?', 'who is Y?', outlining factions or locations, and 'tell me about Z'.",
		systemPrompt: CAMPAIGN_CONTEXT_AGENT_SYSTEM_PROMPT,
		tools: campaignContextToolsBundle,
	};

	constructor(ctx: DurableObjectState, env: any, model: any) {
		super(ctx, env, model, campaignContextToolsBundle);
	}

	protected getToolsForRole(role: CampaignRole | null): Record<string, any> {
		return isGMRole(role)
			? campaignContextToolsBundle
			: playerCampaignContextToolsBundle;
	}
}
