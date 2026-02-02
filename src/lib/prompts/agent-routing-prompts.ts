/**
 * Agent Routing Prompts
 * Prompts for routing user messages to the appropriate specialized agent
 */

/**
 * Generate a prompt for routing a user message to the appropriate agent
 * @param agentDescriptions - Descriptions of all available agents
 * @param userMessage - The user's message to route
 * @param recentContext - Optional recent conversation context
 * @param registeredAgents - List of registered agent type names
 * @returns Formatted prompt string for agent routing
 */
export function formatAgentRoutingPrompt(
  agentDescriptions: string,
  userMessage: string,
  recentContext: string | undefined,
  _registeredAgents: string[]
): string {
  return `Based on the user's message, determine which agent should handle this request.

Available agents:
${agentDescriptions}

User message: "${userMessage}"
${recentContext ? `Recent context: "${recentContext}"` : ""}

Routing rules:
- File operations (upload, processing, indexing, file key, metadata, ingestion) → "resources"
- Campaign management (create, list, update, delete campaigns) → "campaign"
- Campaign analysis (assess campaign, campaign readiness, campaign suggestions, how ready is my campaign) → "campaign-analysis"
- Campaign entity questions (what/who/tell me about [Entity Name], questions about locations/NPCs/items in the campaign) → "campaign-context"
- Character creation/management (create character, generate character backstory, store character info) → "character"
- Character sheet operations (upload character sheet, import character sheet, character sheet file) → "character-sheets"
- Entity graph operations (extract entities from text, create relationship, detect communities, entity graph) → "entity-graph"
- Session recaps (record session, session digest, what happened last session) → "session-digest"
- General help/how-to questions about using the application → "onboarding"

Respond with: agent_name|confidence|reason
Format: agent_name|confidence|reason

Examples:
- "I uploaded a PDF" → resources|90|File upload
- "show me campaigns" → campaign|85|Campaign listing
- "assess my campaign readiness" → campaign-analysis|90|Campaign analysis
- "what is [Location Name]?" → campaign-context|90|Campaign entity question
- "create a character" → character|90|Character creation
- "upload character sheet" → character-sheets|90|Character sheet upload
- "extract entities from this text" → entity-graph|90|Entity extraction
- "record session recap" → session-digest|95|Session recap
- "how do I upload files?" → onboarding|85|General help`;
}

export const AGENT_ROUTING_PROMPTS = {
  formatAgentRoutingPrompt,
};
