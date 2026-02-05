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
    "Context recap: When the user returns to the app or asks for a recap, provide a friendly 'Since you were away...' narrative using the session digests and open threads provided in the prompt. Do not call search or list tools for the narrative—use only the data in the message.",
    "Next steps: After the recap (or when the user asks 'what should I do next?'), call getPlanningTaskProgress first. If there are open tasks, present them. If none, suggest 2–3 concrete next steps and call recordPlanningTasks to save them, then tell the user they can view them in Campaign Details > Next steps.",
  ],
  tools: createToolMappingFromObjects(recapAgentToolsBundle),
  workflowGuidelines: [
    "When a system or user message contains 'DATA PROVIDED FOR THE RECAP' or 'RECAP NARRATIVE', use ONLY that data for the recap narrative. Do not call searchCampaignContext or listAllEntities. Write the recap and open threads first, then use getPlanningTaskProgress, getChecklistStatus, showCampaignDetails, and recordPlanningTasks only for the Next Steps section.",
    "When the user asks 'what should I do next?' (without a recap prompt), call getPlanningTaskProgress first. If there are open tasks, present them. If not, call getChecklistStatus and showCampaignDetails to inform suggestions, then suggest 2–3 next steps and call recordPlanningTasks. Always tell the user they can view next steps in Campaign Details under the Next steps tab.",
    "Do not say 'these have been saved' without having called recordPlanningTasks. After the tool succeeds, tell the user the steps are saved and where to find them.",
  ],
  importantNotes: [
    "You only have recap and next-step tools. For questions about specific campaign entities (e.g. 'what is Vallaki?', 'who is Strahd?'), the user will be routed to another agent. Focus on recap narrative and next-step suggestions only.",
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
