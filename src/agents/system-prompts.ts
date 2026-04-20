/** Conversation rule preset: minimal = core only; dataRetrieval = core + NO IMPROVISATION + PLAIN LANGUAGE */
export type ConversationRulesPreset = "minimal" | "dataRetrieval";

export interface SystemPromptConfig {
	agentName: string;
	responsibilities: string[];
	tools: Record<string, string>;
	workflowGuidelines: string[];
	importantNotes?: string[];
	specialization?: string;
	/** Rule preset. dataRetrieval (default) adds NO IMPROVISATION and PLAIN LANGUAGE for agents that search campaign data. minimal for creative/suggestion agents. */
	conversationRules?: ConversationRulesPreset;
}

/**
 * Extracts tool names from a tools object for safer tool mapping
 */
export function extractToolNames(
	tools: Record<string, any>
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(tools).map(([key, tool]) => {
			// Use the description as the key and the raw tool name as the value
			let userFriendlyName = key;

			if (tool?.description) {
				// Extract the first sentence or phrase from the description
				const description = tool.description;
				// Look for the first sentence ending with a period, or take the first 50 chars
				const firstSentence = description.match(/^([^.]+)/)?.[1]?.trim();
				if (firstSentence && firstSentence.length > 0) {
					userFriendlyName = firstSentence.toLowerCase();
				}
			}

			return [userFriendlyName, key];
		})
	);
}

/**
 * Creates a tool mapping from tool objects with automatic name extraction
 */
export function createToolMappingFromObjects(
	tools: Record<string, any>
): Record<string, string> {
	return extractToolNames(tools);
}

/**
 * Builds a standardized system prompt for agents
 */
export function buildSystemPrompt(config: SystemPromptConfig): string {
	const toolMappings = Object.entries(config.tools)
		.map(([action, tool]) => `- "${action}" → USE ${tool} tool`)
		.join("\n");

	const responsibilities = config.responsibilities
		.map((responsibility) => `- ${responsibility}`)
		.join("\n");

	const workflowGuidelines = config.workflowGuidelines
		.map((guideline, i) => `${i + 1}. ${guideline}`)
		.join("\n");

	const importantNotes = config.importantNotes
		? `\n## Important Notes:\n${config.importantNotes.map((note) => `**IMPORTANT**: ${note}`).join("\n")}`
		: "";

	const specialization = config.specialization
		? `\n## Specialization:\n${config.specialization}`
		: "";

	const useDataRetrievalRules = config.conversationRules !== "minimal";

	const dataRetrievalRules = useDataRetrievalRules
		? `

- **CRITICAL - NO IMPROVISATION: Base your responses ONLY on information found through tool calls (search results, campaign data, etc.). If tools return zero results or insufficient information, DO NOT improvise, generate, or create new content based on your training data. Instead: (1) Clearly report what you searched for and what you found (or didn't find), (2) Explain that you cannot generate new content without permission, and (3) Ask the user if they would prefer to use existing approved content from their campaign as a first priority, or if they would like you to help create something new. Only generate new content if explicitly requested by the user after you've explained the search results and they've chosen option (b).**
- **CRITICAL - PLAIN LANGUAGE: Users are not expected to be technical. When explaining what you searched or found, use simple, everyday language. NEVER use jargon like "semantic search", "entity graph", "campaign context/entities", "query" (as a technical term), "graph traversal", or "embedding". Say instead: "I looked through your campaign for...", "I checked your notes and characters...", "I didn't find any connection between them in your saved information", "your session notes and characters". Keep explanations clear and accessible.**`
		: "";

	return `You are a specialized ${config.agentName} for LoreSmith AI.

## Your Responsibilities:
${responsibilities}

## Available Tools:
${toolMappings}

## Workflow Guidelines:
${workflowGuidelines}${importantNotes}${specialization}

## CRITICAL CONVERSATION RULES:
- **Be conversational, natural, and engaging. Never use canned responses or templates.**
- **Avoid formal structures like "Campaign Name:" or "Campaign Theme:". Use tools directly when you have enough information.**
- **Do NOT use emojis or em dashes in responses; use commas, colons, or a simple hyphen instead.**
- **After using tools, provide a helpful response explaining what you found and what they should do next.**${dataRetrievalRules}

You are focused, efficient, conversational, and always prioritize helping users effectively through natural dialogue.`;
}

/**
 * Injected once per turn whenever the role's toolset includes `getMessageHistory`
 * (see BaseAgent). Keeps one shared definition instead of repeating per agent.
 */
export const MESSAGE_HISTORY_CAPABILITY_RULE = `**Persisted LoreSmith chat:** This turn's tools include **getMessageHistory**. Use it whenever your task needs this user's stored LoreSmith messages (not only the messages in this request). Default **historyScope** is **campaign** (this campaign across sessions for this user). Before saying you cannot see other sessions, an earlier tab, or that there is no chat archive, call the tool; if it returns no rows, say the archive had no matches. Pass **searchQuery**, **afterDate**/**beforeDate**, **limit**, and **offset** as needed (see the tool description).**`;

/** Extra nudge when the user uses vague referents; paired with {@link MESSAGE_HISTORY_CAPABILITY_RULE}. */
export const MESSAGE_HISTORY_REFERENCE_RULE = `**Vague follow-ups** ("the next one", "that one", "these options"): call **getMessageHistory** with a modest **limit** and a **searchQuery** tied to the topic so you resolve what they mean.**`;

/** Extra nudge when the user asks to search or recall chat across time; paired with {@link MESSAGE_HISTORY_CAPABILITY_RULE}. */
export const MESSAGE_HISTORY_RESEARCH_RULE = `**Scan, summarize, or recall across time or topics:** call **getMessageHistory** with the right **historyScope**:
- **campaign** (default): still pass **afterDate** / **beforeDate** / **searchQuery** when the user gives a window or topic.
- **account**: only when they explicitly want **all campaigns**; requires **afterDate**, **beforeDate**, or **searchQuery** (bounded query).
- **current_session**: only when they clearly mean **this tab/thread only**, or when no campaign is selected.

Use **afterDate** / **beforeDate** as ISO 8601 when they give a window (e.g., last 3 days: **afterDate** = three days ago from now). Use **searchQuery** for keywords. Use **limit** up to 100 and increase **offset** to page until batches shrink or you have enough.

Do not invent quotes or character sheets that did not appear in retrieved messages or campaign files. After retrieval, summarize what was actually stored and what was not.**`;

/**
 * Common tool mapping format for consistency
 */
export function createToolMapping(
	tools: Record<string, string>
): Record<string, string> {
	return tools;
}
