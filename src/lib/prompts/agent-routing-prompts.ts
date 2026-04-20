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
- **Persisted LoreSmith chat (this campaign):** Route to **"campaign-context"** when fulfilling the request requires searching, recalling, summarizing, or paging through prior messages stored for this campaign in LoreSmith (any topic or downstream task). Prefer **"campaign-context"** over **"entity-graph"** whenever that archival chat work is part of the task, even if the user also mentions entities, PCs, or the graph.
- File operations (upload, processing, indexing, file key, metadata, ingestion) → "resources"
- Campaign management (create, list, update, delete campaigns) → "campaign"
- Campaign analysis (assess campaign, campaign readiness, campaign suggestions, how ready is my campaign) → "campaign-analysis"
- Next steps / what should I do next (personalized suggestions, what to plan next for this campaign) → "recap". For players, "what should I do next?" is about their character and session review, not campaign planning.
- Context recap requested (e.g. "[Context recap requested]" when user returns or switches campaign) → "recap"
- Session plan readout (e.g. "let's do a readout", "construct the readout", "give me the session plan", "ready-to-run plan", "DM script" after completing next steps) → "recap" (recap agent builds the plan from completed next-step notes; do NOT route to session-digest)
- Campaign entity questions (what/who/tell me about [Entity Name], questions about locations/NPCs/items in the campaign) → "campaign-context"
- Character creation/management (create character, generate character backstory, store character info) → "character"
- Character sheet operations (upload character sheet, import character sheet, character sheet file) → "character-sheets"
- Entity graph operations (extract entities from text, create relationship, detect communities, entity graph) → "entity-graph"
- Session recaps (record session, session digest, what happened last session, create a new digest for a session that just happened) → "session-digest"
- Loot and rewards (encounter loot, dragon hoard treasure, meaningful magic item rewards, track distributed loot) → "loot-reward"
- Rules reference questions (grappling, concentration checks, action economy, spellcasting rules, stat block lookups, "what does the rule say", "does our house rule apply") → "rules-reference"
- Encounter building and scaling (build an encounter, scale this fight, medium-difficulty combat near a location, prepare monster lineup and tactics) → "encounter-builder"
- General help/how-to questions about using the application → "onboarding"
- Boost/credits selection (which boost, help me choose, running out of capacity when adding documents, need more room for documents) → "onboarding"

Respond with: agent_name|confidence|reason
Format: agent_name|confidence|reason

Examples:
- "I uploaded a PDF" → resources|90|File upload
- "show me campaigns" → campaign|85|Campaign listing
- "assess my campaign readiness" → campaign-analysis|90|Campaign analysis
- "what should I do next?" / "what should I do next for this campaign?" → recap|90|Next steps / recap
- "[Context recap requested]" → recap|90|Context recap
- "what is [Location Name]?" → campaign-context|90|Campaign entity question
- "create a character" → character|90|Character creation
- "upload character sheet" → character-sheets|90|Character sheet upload
- "extract entities from this text" → entity-graph|90|Entity extraction
- "record session recap" → session-digest|95|Session recap
- "What loot should the players find after defeating the bandit captain?" → loot-reward|95|Loot generation
- "Suggest a meaningful magic item reward for the ranger who completed her quest" → loot-reward|95|Magic item recommendation
- "Track this distributed item for the party inventory" → loot-reward|95|Loot tracking
- "How does grappling work in 5e?" → rules-reference|95|Rules lookup
- "What is the rule for concentration checks?" → rules-reference|95|Rules lookup
- "Does our house rule on healing apply here?" → rules-reference|95|Rules conflict resolution
- "Build a medium-difficulty encounter for a level 7 party near Ashfen Marsh" → encounter-builder|95|Encounter generation
- "Scale this encounter up for five level 9 characters" → encounter-builder|95|Encounter scaling
- "let's do a readout" / "construct the readout" / "give me the session plan" / "I'm ready for the readout" → recap|95|Session plan readout (from completed next steps)
- "how do I upload files?" → onboarding|85|General help
- "which boost should I get?" / "help me choose a boost" / "I'm running out of capacity" → onboarding|90|Boost selection`;
}

export const AGENT_ROUTING_PROMPTS = {
	formatAgentRoutingPrompt,
};
