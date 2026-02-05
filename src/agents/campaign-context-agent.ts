import { campaignContextToolsBundle } from "../tools/campaign-context/context-tools-bundle";
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
    "Search: Find information in session digests, changelog, and entity graph. Use searchExternalResources when the user asks to search source files or documents.",
    "World state: Record session outcomes and entity/relationship state changes (recordWorldEventTool, updateEntityWorldStateTool, updateRelationshipWorldStateTool).",
    "Entity CRUD: Update entity metadata/type, delete entities, consolidate duplicates. Use listAllEntities when the user asks for counts or a full list.",
    "Planning tasks: getPlanningTaskProgress and recordPlanningTasks are available for context; recap and next-step suggestions are handled by the recap agent.",
  ],
  tools: createToolMappingFromObjects(campaignContextToolsBundle),
  workflowGuidelines: [
    "MANDATORY for entity/location/NPC/faction questions: Call searchCampaignContext FIRST to retrieve current campaign context, then answer from the tool results. Do not answer from memory alone.",
    "When users describe session outcomes (e.g. 'the party killed an NPC', 'they left the town'), use recordWorldEventTool or updateEntityWorldStateTool / updateRelationshipWorldStateTool to update the changelog.",
    "For entity type corrections or duplicate consolidation, use searchCampaignContext or listAllEntities to get real entityIds, then updateEntityTypeTool or deleteEntityTool as appropriate.",
    "Context recap and 'what should I do next?' are handled by the recap agent. If the user asks for a recap or next steps, give a brief signpost (e.g. 'I can show you what’s in the campaign; for a recap or next steps, use the recap.') and focus on entity/search/world-state requests.",
  ],
  importantNotes: [
    "You share the campaign context toolset with the recap agent’s domain: recap and next-step suggestions are the recap agent’s job. You focus on entity questions, search, world state, and entity CRUD.",
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
      "Answers questions about campaign entities (locations, NPCs, factions), search in context/sources, and world state updates. Use for 'what is X?', 'who is Y?', 'tell me about Z'.",
    systemPrompt: CAMPAIGN_CONTEXT_AGENT_SYSTEM_PROMPT,
    tools: campaignContextToolsBundle,
  };

  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, campaignContextToolsBundle);
  }
}
