import { type ToolExecutionOptions, tool } from "ai";
import { z } from "zod";

/**
 * Cross-agent delegation.
 *
 * LoreSmith routes each user turn to exactly one specialized agent, and that
 * agent only holds its own tools. Before this existed, an agent asked for
 * something outside its toolset had one option: tell the user to go ask
 * somewhere else. That answer is never useful. The user does not know or care
 * which internal agent owns which capability, and "ask this in your main
 * campaign conversation" makes them do the routing by hand.
 *
 * `askAnotherAgent` gives every agent a second option. It runs the target
 * agent's system prompt and tools to completion and returns the answer as a
 * tool result, so the calling agent can fold it into its own reply. The user
 * sees one continuous response and never learns a handoff happened.
 */

export interface DelegatedAgentResult {
	/** The agent type that actually did the work. */
	agent: string;
	/** The delegate's final text answer. */
	answer: string;
	/** Tool names the delegate called, for observability and grounding checks. */
	toolsUsed: string[];
}

export type DelegatedAgentRunner = (input: {
	agentType: string;
	request: string;
}) => Promise<DelegatedAgentResult>;

export interface DelegationCatalogEntry {
	agent: string;
	description: string;
}

/**
 * Injected into every turn where delegation is available. Stated as a hard
 * prohibition because the failure mode it replaces reads as helpful: a polite
 * "I'm not the right part of LoreSmith for that, try over there" looks like
 * good service and is actually a dead end.
 */
export const AGENT_HANDOFF_SYSTEM_RULE = `**HANDOFF, NEVER DEFLECT:** You are one of several specialists behind a single LoreSmith assistant. The user does not know specialists exist and must never be asked to route their own request.

- NEVER tell the user that a request is outside your area, that you are "the part of LoreSmith that handles X", that they should ask elsewhere, in another conversation, in a different chat, or of a different agent. NEVER name another agent to the user.
- When a request needs a capability you lack, call **askAnotherAgent** with the agent best suited to it and a self-contained restatement of what is needed. Then answer the user using what comes back, in your own voice, as one continuous reply.
- Do the part you CAN do first, then delegate the rest. If a request has several parts, you may call askAnotherAgent more than once.
- Only if askAnotherAgent returns no usable answer do you tell the user something could not be done, and then you say plainly what was tried and what was missing, still without mentioning agents.`;

const askAnotherAgentSchema = z.object({
	agentType: z
		.string()
		.describe(
			"The agent best suited to this request. Must be one of the agent types listed in the tool description."
		),
	request: z
		.string()
		.describe(
			"A self-contained restatement of what the other agent should do. The delegate does NOT see this conversation, so include every detail it needs: the actual question, and any file names, campaign details, character names, or prior context it depends on."
		),
	reason: z
		.string()
		.describe(
			"Short internal note on why this agent was chosen. Never shown to the user."
		),
});

/** Render the catalog so the model picks a real agent instead of inventing one. */
export function buildAskAnotherAgentDescription(
	catalog: DelegationCatalogEntry[]
): string {
	const agentList = catalog
		.map((entry) => `- ${entry.agent}: ${entry.description}`)
		.join("\n");

	return `Hand part or all of the user's request to another LoreSmith specialist and get its answer back.

Use this whenever the request needs something your own tools cannot do: searching inside uploaded rulebooks, campaign data, character sheets, session history, encounters, loot, and so on. Calling this is ALWAYS better than telling the user you cannot help or that they should ask somewhere else.

The delegate runs with its own tools and returns a finished answer. It cannot see this conversation, so put everything it needs into "request".

Available agents:
${agentList}`;
}

export function createAskAnotherAgentTool(params: {
	catalog: DelegationCatalogEntry[];
	run: DelegatedAgentRunner;
}) {
	const { catalog, run } = params;
	const knownAgents = new Set(catalog.map((entry) => entry.agent));

	return tool({
		description: buildAskAnotherAgentDescription(catalog),
		inputSchema: askAnotherAgentSchema,
		execute: async (
			input: z.infer<typeof askAnotherAgentSchema>,
			options?: ToolExecutionOptions<never>
		): Promise<any> => {
			const toolCallId = options?.toolCallId ?? "unknown";

			if (!knownAgents.has(input.agentType)) {
				return {
					toolCallId,
					result: {
						success: false,
						message: `"${input.agentType}" is not an available agent. Choose one of: ${[...knownAgents].join(", ")}.`,
						data: null,
					},
				};
			}

			try {
				const delegated = await run({
					agentType: input.agentType,
					request: input.request,
				});

				if (!delegated.answer.trim()) {
					return {
						toolCallId,
						result: {
							success: false,
							message: `The ${input.agentType} specialist returned nothing. Try a different agent or a more specific request before telling the user anything.`,
							data: { agent: delegated.agent, toolsUsed: delegated.toolsUsed },
						},
					};
				}

				return {
					toolCallId,
					result: {
						success: true,
						message:
							"Answer from another specialist. Relay this to the user in your own voice as part of your reply. Do not mention that another agent was involved.",
						data: delegated,
					},
				};
			} catch (error) {
				return {
					toolCallId,
					result: {
						success: false,
						message: `Could not reach the ${input.agentType} specialist: ${error instanceof Error ? error.message : String(error)}. Answer with what you do have; do not tell the user to ask elsewhere.`,
						data: null,
					},
				};
			}
		},
	});
}
