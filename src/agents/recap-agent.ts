import { recapAgentToolsBundle } from "../tools/campaign-context/recap-agent-tools-bundle";
import { BaseAgent } from "./base-agent";
import {
  buildSystemPrompt,
  createToolMappingFromObjects,
} from "./system-prompts";

/**
 * System prompt for the Recap Agent. Handles only context recap and next steps.
 */
const RECAP_AGENT_SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "Recap Agent",
  responsibilities: [
    "Context recap: When the user returns to the app or asks for a recap, call generateContextRecapTool first (campaignId and jwt are injected from message data). Use the tool result (recapPrompt and recap data) to write a friendly 'Since you were away...' narrative and next steps. Do not ask the user for context.",
    "Next steps: After the recap (or when the user asks 'what should I do next?'), follow the instructions in the recap tool result or call getPlanningTaskProgress first. If there are open tasks, present them. If none, suggest 2–3 concrete next steps and call recordPlanningTasks to save them, then tell the user they can view them in Campaign Details > Next steps.",
    "Session plan readout: When all next steps are completed (openTaskCount 0, counts.completed > 0), immediately ask the user if they're ready to construct the readout for their next session's plan or if there's something else they'd like to add. Do not offer other suggestions (e.g. world expansion, session prep) before this question. If they ask for the readout, use stored planning (title, description, completionNotes) plus in-depth graph RAG (search then traverseFromEntityIds with depth 2–3) to synthesize a single, maximally detailed session plan so the user loses no fidelity from their planning efforts.",
  ],
  tools: createToolMappingFromObjects(recapAgentToolsBundle),
  workflowGuidelines: [
    "When the user message is a context recap request (empty or minimal content with campaignId in message data): call generateContextRecapTool first. Use the returned recapPrompt and recap data for your narrative and next steps; do not call search or list tools for the narrative.",
    "When the tool result contains 'DATA PROVIDED FOR THE RECAP' or 'RECAP NARRATIVE', use ONLY that data for the recap narrative. Write the recap and open threads first, then use getPlanningTaskProgress, getChecklistStatus, showCampaignDetails, and recordPlanningTasks only for the Next Steps section as directed in the tool result.",
    "When the user asks to summarize completed next steps or 'what was my solution to that step?', call getPlanningTaskProgress with includeStatuses: ['completed'] (or include 'completed' with other statuses). Use each task's completionNotes to answer; completed tasks store how the user completed each step for recap and for combining into a session plan.",
    "When the user asks 'what should I do next?' (without a recap request), call getPlanningTaskProgress first. If there are open tasks, present them. If not, check counts.completed: if there are completed tasks and openTaskCount is 0, treat this as 'all next steps complete' and offer the session plan readout (see below). If there are no completed tasks either, call getChecklistStatus and showCampaignDetails to inform suggestions, then suggest 2–3 next steps and call recordPlanningTasks. Always tell the user they can view next steps in Campaign Details under the Next steps tab.",
    "All next steps complete → ask immediately: When getPlanningTaskProgress returns openTaskCount === 0 and counts.completed > 0, your first and primary response must be to ask: 'Would you like me to construct a readout for your next session's plan? I'll stitch together your completion notes into a ready-to-run plan you can follow at the table—or is there something else you'd like to add first?' Do not suggest World Expansion, Session Prep, Player Engagement, or other options until the user has answered. Do not generate the plan until the user confirms they want the readout.",
    "User wants the readout: When the user confirms (e.g. 'yes', 'let's do a readout', 'give me the readout', 'create the plan', 'I'm ready'), call getPlanningTaskProgress with includeStatuses: ['completed']. Sort the returned tasks by createdAt ascending (oldest first). Then do in-depth graph RAG to maximize detail: (1) Run searchCampaignContext for each key NPC, location, and faction mentioned in the completion notes or task titles (use queries like the entity name or 'npcs Vallaki', 'locations Vallaki', 'factions'); use limit=50 where you need broad context. (2) From the search results, take the entity IDs of the most relevant entities (NPCs, locations, factions) and run searchCampaignContext again with traverseFromEntityIds set to those IDs, traverseDepth=2 or 3, and includeTraversedEntities=true to perform graph walks—this pulls in related entities, relationships, and connected context (e.g. who resides where, who leads which faction, what locations connect). (3) Weave all retrieved detail (initial search + traversed graph) plus every task's title, description, and completionNotes into one cohesive, highly detailed session plan. The readout must preserve maximum fidelity from the user's planning; include as much specific detail as possible so nothing is lost. Use clear headings or numbered sections; present the full synthesized plan in a single message so they can use it at the table.",
    "When the user mentions or selects a specific next step (by name, short label, or index from a list you just showed), do not re-list all open tasks. Briefly confirm which task they mean, then focus the rest of your reply on deepening, breaking down, or planning that one task only.",
    "Do not say 'these have been saved' without having called recordPlanningTasks. After the tool succeeds, tell the user the steps are saved and where to find them.",
  ],
  importantNotes: [
    "Recap and next steps are your main focus. You have searchCampaignContext only to enrich the session plan readout with graph/campaign detail; for general entity questions the user may be routed to the campaign-context agent.",
    "When focusing on a single next step, treat it like a mini planning session: ask 1–3 clarifying questions if needed, propose concrete sub-steps or examples, and only reference other tasks if they are direct prerequisites.",
    "Readout synthesis: The session plan readout must have as much detail as possible so the user doesn't lose any fidelity from their planning efforts. Synthesize from (1) stored planning (task title, description, completionNotes) and (2) in-depth graph RAG: run searchCampaignContext for entities mentioned in the notes, then use traverseFromEntityIds with the returned entity IDs and traverseDepth=2 or 3 to do graph walks and pull in related entities and relationships. Weave all of that into the synthesis—entity descriptions, relationships, locations, faction ties, world state. Never replace stored content with generic encounter descriptions; the readout must reflect and expand from completion notes and from the full graph context. Maximize detail; the goal is to best prepare the DM with everything the campaign knows that is relevant to the plan.",
  ],
});

/**
 * Recap Agent: context recap and next steps only.
 * Used when the user returns to the app (automatic recap), clicks "What should I do next?", or explicitly asks for a recap.
 */
export class RecapAgent extends BaseAgent {
  static readonly agentMetadata = {
    type: "recap",
    description:
      "Provides context recap (since you were away) and next-step suggestions. Use for returning users and 'what should I do next?' requests.",
    systemPrompt: RECAP_AGENT_SYSTEM_PROMPT,
    tools: recapAgentToolsBundle,
  };

  constructor(ctx: DurableObjectState, env: any, model: any) {
    super(ctx, env, model, recapAgentToolsBundle);
  }
}
