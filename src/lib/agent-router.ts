import { generateText } from "ai";
import { getGenerationModelForProvider } from "@/app-constants";
import {
	matchAdvisoryRoute,
	matchDecisiveRoute,
	type RoutingDecisionSource,
	resolveExplicitAgentHint,
} from "@/lib/agent-routing-fast-path";
import { logRoutingDecision } from "@/lib/agent-routing-telemetry";
import { anthropicSamplingParams } from "@/lib/anthropic-model-options";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { AgentNotRegisteredError } from "@/lib/errors";
import { LLM_SPEND_INTENT } from "@/lib/llm-usage-intents";
import { logVerboseLlmSpend } from "@/lib/llm-usage-verbose-log";
import type { CampaignRole } from "@/types/campaign";
import { createModel } from "./model-config";
import { ModelManager } from "./model-manager";
import {
	AGENT_ROUTING_PROMPTS,
	type AgentRoutingPromptParts,
} from "./prompts/agent-routing-prompts";

export type AgentType =
	| "audio"
	| "campaign"
	| "campaign-context"
	| "recap"
	| "campaign-analysis"
	| "character"
	| "character-sheets"
	| "entity-graph"
	| "onboarding"
	| "resources"
	| "session-digest"
	| "loot-reward"
	| "rules-reference"
	| "encounter-builder"
	| "shards";

export interface AgentIntent {
	agent: AgentType;
	confidence: number;
	reason: string;
	/**
	 * Which layer produced this decision. Useful for callers that want to know
	 * whether a model call happened; always logged regardless.
	 */
	source?: RoutingDecisionSource;
}

/** Optional inputs that let `routeMessage` skip the classifier or log better. */
export interface RouteMessageOptions {
	/**
	 * The `data` blob from the last user message. Read for an `agentType` hint
	 * when the client already knows which agent it wants.
	 */
	messageData?: unknown;
	/** Worker env, used only for routing-decision logging. */
	env?: EnvWithSecrets | Record<string, unknown>;
}

export interface AgentRegistry {
	[key: string]: {
		description: string;
		agentClass: any;
		tools: Record<string, any>;
		systemPrompt: string;
	};
}

export class AgentRouter {
	// Registry of available agents - automatically populated from BaseAgent classes
	private static agentRegistry: AgentRegistry = {};

	/**
	 * Register an agent with the router
	 */
	static registerAgent(
		agentType: AgentType,
		agentClass: any,
		tools: Record<string, any>,
		systemPrompt: string,
		description?: string
	) {
		AgentRouter.agentRegistry[agentType] = {
			description: description || `Handles ${agentType} operations`,
			agentClass,
			tools,
			systemPrompt,
		};
	}

	/**
	 * Get all registered agent types
	 */
	static getRegisteredAgentTypes(): string[] {
		return Object.keys(AgentRouter.agentRegistry);
	}

	/**
	 * Get agent registry information
	 */
	static getAgentRegistry(): AgentRegistry {
		return { ...AgentRouter.agentRegistry };
	}

	/**
	 * Create an agent instance
	 */
	static createAgentInstance(
		agentType: string,
		ctx: DurableObjectState,
		env: any,
		model?: any
	): any {
		const agentInfo = AgentRouter.agentRegistry[agentType];
		if (!agentInfo) {
			throw new AgentNotRegisteredError(agentType);
		}

		// Use the provided model or get from global model manager
		const modelToUse = model || ModelManager.getInstance().getModel();
		return new agentInfo.agentClass(ctx, env, modelToUse);
	}

	/**
	 * Get agent tools
	 */
	static getAgentTools(agentType: string): Record<string, any> {
		const agentInfo = AgentRouter.agentRegistry[agentType];
		if (!agentInfo) {
			throw new AgentNotRegisteredError(agentType);
		}

		return agentInfo.tools;
	}

	/**
	 * Get agent system prompt
	 */
	static getAgentSystemPrompt(agentType: string): string {
		const agentInfo = AgentRouter.agentRegistry[agentType];
		if (!agentInfo) {
			throw new AgentNotRegisteredError(agentType);
		}

		return agentInfo.systemPrompt;
	}

	/**
	 * Route a user message to the most appropriate agent using LLM-based analysis.
	 *
	 * This method uses the LLM to analyze the user's message against the descriptions
	 * of all registered agents, making intelligent routing decisions based on:
	 * - Agent capabilities and specializations
	 * - User intent and request type
	 * - Which agent's tools would be most relevant
	 *
	 * The LLM examines agent descriptions like:
	 * - "resources: Manages PDF file uploads, file processing, metadata updates, and file ingestion..."
	 * - "campaign: Handles campaign management, session planning, world building..."
	 * - "onboarding: Provides guidance and help for new users..."
	 *
	 * And makes routing decisions based on these descriptions rather than hardcoded rules.
	 *
	 * Before reaching the classifier, two cheaper layers get a chance to answer:
	 * an explicit `agentType` hint from the caller, then a deterministic rules
	 * pass over phrases with exactly one sensible destination. Both are exact —
	 * genuinely ambiguous messages still reach the model.
	 *
	 * @param userMessage - The user's message to route
	 * @param recentContext - Optional recent context for routing decisions
	 * @param ragService - Optional RAG service for enhanced routing
	 * @param model - Optional model override
	 * @param options - Caller-supplied intent hint and env for logging
	 * @returns Promise<AgentIntent> - The routing decision with agent, confidence, and reason
	 */
	static async routeMessage(
		userMessage: string,
		recentContext?: string,
		_ragService?: any,
		model?: any,
		options?: RouteMessageOptions
	): Promise<AgentIntent> {
		const registeredAgents = AgentRouter.getRegisteredAgentTypes();
		const env = options?.env;
		const startedAt = Date.now();

		// Layer 1: the caller already knows the intent (UI-initiated actions).
		const hintedAgent = resolveExplicitAgentHint(
			options?.messageData,
			registeredAgents
		);
		if (hintedAgent) {
			const intent: AgentIntent = {
				agent: hintedAgent as AgentType,
				confidence: 100,
				reason: "Explicit agent hint from client",
				source: "explicit-hint",
			};
			logRoutingDecision(env, {
				source: "explicit-hint",
				agent: intent.agent,
				confidence: intent.confidence,
				reason: intent.reason,
				latencyMs: Date.now() - startedAt,
			});
			return intent;
		}

		// Layer 2: deterministic rules for unambiguous phrasing.
		const decisive = matchDecisiveRoute(userMessage);
		if (decisive && registeredAgents.includes(decisive.agent)) {
			const intent: AgentIntent = {
				agent: decisive.agent as AgentType,
				confidence: decisive.confidence,
				reason: decisive.reason,
				source: "deterministic",
			};
			logRoutingDecision(env, {
				source: "deterministic",
				agent: intent.agent,
				confidence: intent.confidence,
				reason: intent.reason,
				rule: decisive.rule,
				latencyMs: Date.now() - startedAt,
			});
			return intent;
		}

		// Layer 3: genuinely ambiguous — ask the classifier.
		const agentDescriptions = registeredAgents
			.map(
				(agentType) =>
					`- ${agentType}: ${AgentRouter.getAgentDescription(agentType)}`
			)
			.join("\n");

		const promptParts = AGENT_ROUTING_PROMPTS.formatAgentRoutingPromptParts(
			agentDescriptions,
			userMessage,
			recentContext
		);

		// Evaluated but never routed on — this is the disagreement signal that
		// tells us which advisory rules are safe to promote to decisive.
		const advisory = matchAdvisoryRoute(userMessage);

		const finish = (
			intent: AgentIntent,
			routedModelId?: string,
			tokens?: number
		) => {
			logRoutingDecision(env, {
				source: intent.source ?? "llm",
				agent: intent.agent,
				confidence: intent.confidence,
				reason: intent.reason,
				advisoryAgent: advisory?.agent,
				advisoryAgreed: advisory ? advisory.agent === intent.agent : undefined,
				rule: advisory?.rule,
				latencyMs: Date.now() - startedAt,
				model: routedModelId,
			});
			if (tokens !== undefined && routedModelId) {
				logVerboseLlmSpend(env, {
					intent: LLM_SPEND_INTENT.agent_routing,
					source: "AgentRouter.routeMessage",
					tokens,
					model: routedModelId,
					extras: { agent: intent.agent, confidence: intent.confidence },
				});
			}
			return intent;
		};

		try {
			const { text, modelId, tokens } = await AgentRouter.callLLM(
				promptParts,
				model
			);
			const [agent, confidenceStr, reason] = text.split("|");

			// Validate that the agent is registered
			if (!registeredAgents.includes(agent)) {
				return finish(
					{
						agent: "resources" as AgentType,
						confidence: 30,
						reason: "Invalid agent, defaulting to resources",
						source: "fallback",
					},
					modelId,
					tokens
				);
			}

			return finish(
				{
					agent: agent as AgentType,
					confidence: parseInt(confidenceStr, 10) || 50,
					reason: reason || "LLM-based routing",
					source: "llm",
				},
				modelId,
				tokens
			);
		} catch (_error) {
			// Default to resources for file-related operations
			return finish({
				agent: "resources" as AgentType,
				confidence: 30,
				reason: "LLM routing failed, defaulting to resources",
				source: "fallback",
			});
		}
	}

	/**
	 * Run the routing classifier.
	 *
	 * The stable half of the prompt (agent descriptions, routing rules,
	 * examples) is sent as a cache-marked text part so the provider can serve it
	 * from its prompt cache; only the message and its recent context follow the
	 * breakpoint.
	 *
	 * Caveat worth knowing before optimizing further: that prefix currently
	 * measures ~1.9k tokens, and Anthropic's minimum cacheable prefix on
	 * claude-haiku-4-5 (the PIPELINE_LIGHT tier this uses) is 4096 tokens. Below
	 * the minimum the breakpoint is silently ignored — no error, no cost, and no
	 * cache either. It is kept because it costs nothing and starts working the
	 * moment the prefix crosses that threshold or the tier moves to a
	 * Sonnet/Opus model (1024 / 512 minimum respectively). The saving that is
	 * real today is the deduplication below.
	 *
	 * The system prompt is deliberately short and static — the agent
	 * descriptions used to be duplicated here *and* in the user message, so
	 * every routing call shipped the registry twice.
	 */
	private static async callLLM(
		promptParts: AgentRoutingPromptParts,
		model?: any
	): Promise<{ text: string; modelId?: string; tokens?: number }> {
		const systemPrompt =
			"You are an intelligent router that determines which AI agent should handle a user's request. " +
			"Respond with ONLY the agent type followed by a confidence score (0-100) and a brief reason, separated by pipes. " +
			'Example format: "agent_type|confidence|reason"';

		// Prefer PIPELINE_LIGHT for routing (faster, lower cost) when API key is available
		const modelManager = ModelManager.getInstance();
		const apiKey = modelManager.getApiKey();
		const modelToUse =
			(apiKey
				? createModel(getGenerationModelForProvider("PIPELINE_LIGHT"), apiKey)
				: null) ||
			model ||
			modelManager.getModel();

		// If no model is available, we can't route the message
		if (!modelToUse) {
			return {
				text: "campaign|50|No model available for routing, using default agent",
			};
		}

		// Use generateText for the routing decision (single turn, no tools)
		const routedModelId =
			(modelToUse as { modelId?: string })?.modelId ??
			getGenerationModelForProvider("PIPELINE_LIGHT");
		const sampling = anthropicSamplingParams(routedModelId, 0);
		const result = await generateText({
			model: modelToUse,
			system: systemPrompt,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: promptParts.cacheablePrefix,
							providerOptions: {
								anthropic: { cacheControl: { type: "ephemeral" } },
							},
						},
						{ type: "text", text: promptParts.variableSuffix },
					],
				},
			],
			...sampling,
		});

		const usage = result.usage as
			| {
					totalTokens?: number;
					promptTokens?: number;
					completionTokens?: number;
			  }
			| undefined;
		const tokens =
			usage?.totalTokens ??
			(usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);

		return {
			text: (result.text ?? "").trim(),
			modelId: routedModelId,
			tokens,
		};
	}

	static getAgentDescription(agentType: string): string {
		const agentInfo = AgentRouter.agentRegistry[agentType];
		return agentInfo?.description || `Handles ${agentType} operations`;
	}

	/**
	 * Resolve the tool set a target agent would expose to a user holding `role`.
	 *
	 * Agents narrow their own toolset for players via a `getToolsForRole` instance
	 * method. Delegation has to honour that narrowing, or handing a player's
	 * question to another agent would quietly hand them GM-only tools too. Every
	 * implementation is a pure role -> bundle lookup that never touches `this`, so
	 * reading it off the prototype is safe and avoids constructing a second
	 * Durable Object just to ask which tools it would use.
	 *
	 * Agents without the method expose the same tools to every role.
	 */
	static getAgentToolsForRole(
		agentType: string,
		role: CampaignRole | null
	): Record<string, any> {
		const agentInfo = AgentRouter.agentRegistry[agentType];
		if (!agentInfo) {
			throw new AgentNotRegisteredError(agentType);
		}

		const prototype = agentInfo.agentClass?.prototype;
		const roleFilter = prototype?.getToolsForRole;
		if (typeof roleFilter === "function") {
			return roleFilter.call(prototype, role) ?? {};
		}

		return agentInfo.tools ?? {};
	}

	/**
	 * The other agents a running agent may hand work to, with the descriptions the
	 * router already uses to pick between them. Excluding the caller keeps an
	 * agent from delegating to itself.
	 */
	static getDelegationCatalog(
		excludeAgentType?: string
	): Array<{ agent: string; description: string }> {
		return Object.entries(AgentRouter.agentRegistry)
			.filter(([agentType]) => agentType !== excludeAgentType)
			.map(([agentType, agentInfo]) => ({
				agent: agentType,
				description: agentInfo.description,
			}));
	}
}
