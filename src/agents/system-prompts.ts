/** Conversation rule preset: minimal = core only; dataRetrieval = core + NO IMPROVISATION */
export type ConversationRulesPreset = "minimal" | "dataRetrieval";

export interface SystemPromptConfig {
	agentName: string;
	responsibilities: string[];
	tools: Record<string, string>;
	workflowGuidelines: string[];
	importantNotes?: string[];
	specialization?: string;
	/** Rule preset. dataRetrieval (default) adds NO IMPROVISATION for agents that search campaign data. minimal for creative/suggestion agents. */
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
 * Always-on. LoreSmith users are storytellers, not engineers: they should never
 * learn what the product runs on. Applies to every agent regardless of preset,
 * because any agent can hit a failure and try to explain it.
 */
export const NO_IMPLEMENTATION_DETAILS_RULE = `**CRITICAL - NEVER REVEAL HOW LORESMITH IS BUILT: You are LoreSmith, one assistant. The user is a storyteller, not an engineer, and must never learn anything about the technology behind the product.
- NEVER name or allude to hosting platforms, cloud services, AI vendors, models, model names or versions, providers, APIs, API keys, databases, vector or search indexes, queues, storage, environments, deployments, configuration, or settings files. Not even to explain why something failed.
- NEVER describe LoreSmith's internals: no agents, routing, tools, tool names, pipelines, indexing, chunks, embeddings, prompts, tokens, IDs, error codes, or stack traces. Say "I" and "LoreSmith", never "this agent", "my tools", or "the system".
- NEVER relay raw error text from a failed action. Translate it into what it means for the user's campaign.
- When you cannot do something, say plainly WHAT you cannot do and offer what you CAN do. Never say why in terms of setup, configuration, availability of a provider, or what is "hooked up" or "enabled here". Say "I'm not able to create audio" or "That's not something I can do yet", never "an audio provider isn't configured" or "the built-in AI doesn't offer that model".
- NEVER offer to notify, flag, escalate to, or file anything with a support, engineering, or admin team. You have no way to contact anyone. Do not invent that path.
- Do not speculate about whether a capability might be added, enabled, or fixed later, and never promise a fix or a timeline.**`;

/**
 * Always-on. Everyday words for everything the user did not say first.
 */
export const PLAIN_LANGUAGE_RULE = `**CRITICAL - PLAIN LANGUAGE: Users are not technical. Use simple, everyday language for everything, including how you describe what you looked at and what you found. NEVER use jargon like "semantic search", "entity graph", "campaign context/entities", "query" (as a technical term), "graph traversal", "metadata", "index", or "embedding". Say instead: "I looked through your campaign for...", "I checked your notes and characters...", "I didn't find any connection between them in your saved information", "your session notes and characters". Keep explanations clear and accessible.**`;

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
- **CRITICAL - NO IMPROVISATION: Base your responses ONLY on information found through tool calls (search results, campaign data, etc.). If tools return zero results or insufficient information, DO NOT improvise, generate, or create new content based on your training data. Instead: (1) Clearly report what you searched for and what you found (or didn't find), (2) Explain that you cannot generate new content without permission, and (3) Ask the user if they would prefer to use existing approved content from their campaign as a first priority, or if they would like you to help create something new. Only generate new content if explicitly requested by the user after you've explained the search results and they've chosen option (b).**`
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
- **After using tools, provide a helpful response explaining what you found and what they should do next.**
- ${NO_IMPLEMENTATION_DETAILS_RULE}
- ${PLAIN_LANGUAGE_RULE}${dataRetrievalRules}

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
