/**
 * Deterministic pre-router for agent selection.
 *
 * `AgentRouter.routeMessage` used to pay an LLM classification call on every
 * single chat message. This module short-circuits that call for the traffic
 * whose intent is already known, in two layers:
 *
 * 1. **Explicit hint** (`resolveExplicitAgentHint`) — the client told us which
 *    agent it wants. UI-initiated turns ("record a session recap", "help")
 *    know their own intent; there is nothing for a model to re-derive.
 * 2. **Decisive rules** (`matchDecisiveRoute`) — exact, normalized matches on
 *    phrases the product itself emits, plus a small set of anchored patterns
 *    the routing prompt already maps unambiguously.
 *
 * Anything else falls through to the LLM classifier untouched.
 *
 * A third, non-short-circuiting layer (`matchAdvisoryRoute`) exists purely for
 * measurement: it guesses with loose keyword heuristics that are *not* safe to
 * route on, so we can log how often the classifier agrees with a cheap rule and
 * decide which advisory rules are worth promoting to decisive. See
 * `agent-routing-telemetry.ts`.
 *
 * Adding a decisive rule is a routing behavior change. The bar is that the
 * message must have exactly one sensible destination — when in doubt, add it as
 * advisory instead and read the logs.
 */

import {
	CONTEXT_RECAP_PLACEHOLDER,
	UI_INITIATED_PROMPTS,
} from "@/app-constants";

/** Where a routing decision came from. Recorded on every decision. */
export type RoutingDecisionSource =
	| "explicit-hint"
	| "deterministic"
	| "llm"
	| "fallback";

export interface FastPathMatch {
	agent: string;
	/** 0-100, mirroring `AgentIntent.confidence`. */
	confidence: number;
	reason: string;
	/** Which rule fired, for telemetry and debugging. */
	rule: string;
}

/**
 * Normalize a message for exact-phrase comparison: trim, collapse internal
 * whitespace, lowercase, and drop trailing sentence punctuation. Deliberately
 * conservative — it does not strip words, so a phrase embedded in a longer
 * message will not match.
 */
export function normalizeForMatching(message: string): string {
	return message
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase()
		.replace(/[.!?\s]+$/, "");
}

/**
 * Layer 1: read an explicit agent type supplied by the caller.
 *
 * Accepts the merged `data` blob carried on the last user message. The hint is
 * validated against the live registry, so a stale or hostile client cannot
 * route to an agent that does not exist — an unrecognized value is ignored and
 * routing proceeds normally rather than failing.
 */
export function resolveExplicitAgentHint(
	messageData: unknown,
	registeredAgents: readonly string[]
): string | null {
	if (!messageData || typeof messageData !== "object") {
		return null;
	}
	const hint = (messageData as { agentType?: unknown }).agentType;
	if (typeof hint !== "string") {
		return null;
	}
	const normalized = hint.trim();
	return registeredAgents.includes(normalized) ? normalized : null;
}

/**
 * Exact-phrase table. Keys are normalized message text; values are the agent
 * the routing prompt already assigns to that exact phrase.
 *
 * The UI-initiated prompts are sourced from `UI_INITIATED_PROMPTS` rather than
 * retyped, so editing the prompt in one place cannot silently break routing.
 */
const DECISIVE_PHRASES: ReadonlyArray<
	readonly [phrase: string, agent: string, reason: string]
> = [
	[
		normalizeForMatching(CONTEXT_RECAP_PLACEHOLDER),
		"recap",
		"Context recap sentinel",
	],
	[
		normalizeForMatching(UI_INITIATED_PROMPTS.HELP),
		"onboarding",
		"UI help request",
	],
	[
		normalizeForMatching(UI_INITIATED_PROMPTS.SESSION_RECAP),
		"session-digest",
		"UI session recap request",
	],
	[
		normalizeForMatching(UI_INITIATED_PROMPTS.NEXT_STEPS_GM),
		"recap",
		"UI next steps request",
	],
	[
		normalizeForMatching(UI_INITIATED_PROMPTS.NEXT_STEPS_PLAYER),
		"recap",
		"UI next steps request",
	],
	// Session plan readout: the routing prompt lists these verbatim as "recap".
	["let's do a readout", "recap", "Session plan readout"],
	["lets do a readout", "recap", "Session plan readout"],
	["construct the readout", "recap", "Session plan readout"],
	["give me the session plan", "recap", "Session plan readout"],
	["i'm ready for the readout", "recap", "Session plan readout"],
	["im ready for the readout", "recap", "Session plan readout"],
	// Free-typed variants of the next-steps question.
	["what should i do next", "recap", "Next steps question"],
];

const DECISIVE_PHRASE_LOOKUP: ReadonlyMap<
	string,
	{ agent: string; reason: string }
> = new Map(
	DECISIVE_PHRASES.map(([phrase, agent, reason]) => [phrase, { agent, reason }])
);

/**
 * Anchored patterns for intents whose vocabulary has exactly one destination.
 *
 * Unlike the phrase table these match a *prefix* of the message, so they cover
 * open-ended objects ("generate music for this campaign", "make ambience for
 * the crypt scene") that no fixed phrase list could enumerate. They are still
 * decisive, so the same bar applies: the pattern must be anchored at the start
 * of the message and must not fire on a request that merely mentions the topic.
 *
 * The anchoring is what keeps them honest. "generate music" is an audio
 * request; "generate a summary of the music the bards play" is a campaign
 * question, and the determiner group deliberately excludes it by requiring the
 * audio noun to be the direct object of the verb.
 */
const DECISIVE_PATTERNS: ReadonlyArray<{
	rule: string;
	agent: string;
	reason: string;
	pattern: RegExp;
}> = [
	{
		rule: "pattern:audio-generation",
		agent: "audio",
		reason: "Audio generation request",
		pattern:
			/^(?:please\s+|hey,?\s+|ok(?:ay)?,?\s+|can you\s+|could you\s+|go ahead and\s+|i want you to\s+|i'?d like you to\s+)*(?:generate|make|create|produce|compose)\s+(?:me\s+)?(?:some\s+|a\s+|an\s+|the\s+)?(?:new\s+|short\s+|long\s+|quick\s+|custom\s+|looping\s+|background\s+)*(?:music|ambience|ambiance|soundscape|sound\s?effects?|sfx|audio(?:\s+track)?|theme\s+(?:music|song|tune)|creature\s+(?:sound|noise|vocali[sz]ation)s?)\b/i,
	},
	{
		rule: "pattern:audio-library",
		agent: "audio",
		reason: "Generated audio library request",
		pattern:
			/^(?:please\s+|can you\s+|could you\s+)*(?:list|show(?:\s+me)?|delete|remove|what)\s+(?:me\s+)?(?:all\s+|the\s+|my\s+|any\s+)?(?:audio\s+tracks?|generated\s+audio|audio\s+for\s+this\s+campaign)\b/i,
	},
];

/**
 * Layer 2: match a message we can route without a model call.
 *
 * Phrase matching is whole-message equality on the normalized text, never
 * substring containment — "what should I do next about the grappling rules" is
 * genuinely ambiguous between `recap` and `rules-reference`, so it must reach
 * the classifier.
 *
 * Anchored patterns run second, for intents whose object is open-ended and so
 * cannot be enumerated as phrases. Returns null when neither layer matches.
 */
export function matchDecisiveRoute(userMessage: string): FastPathMatch | null {
	const normalized = normalizeForMatching(userMessage);
	if (!normalized) {
		return null;
	}

	const hit = DECISIVE_PHRASE_LOOKUP.get(normalized);
	if (hit) {
		return {
			agent: hit.agent,
			confidence: 100,
			reason: hit.reason,
			rule: `phrase:${normalized.slice(0, 40)}`,
		};
	}

	for (const { rule, agent, reason, pattern } of DECISIVE_PATTERNS) {
		if (pattern.test(normalized)) {
			return { agent, confidence: 100, reason, rule };
		}
	}

	return null;
}

/**
 * Advisory rules — measurement only, never used to route.
 *
 * Each entry is a loose signal drawn from the routing prompt's own rule list.
 * They are the candidates for promotion to decisive: if the classifier agrees
 * with an advisory guess on nearly all traffic that matches it, that rule can
 * short-circuit and save a model call.
 */
const ADVISORY_RULES: ReadonlyArray<{
	rule: string;
	agent: string;
	pattern: RegExp;
}> = [
	{
		rule: "advisory:rules-reference",
		agent: "rules-reference",
		pattern:
			/\b(what does the rule say|rules? for|how does .{1,40} work in 5e|house rule|concentration check|action economy|grappl)/i,
	},
	{
		rule: "advisory:encounter-builder",
		agent: "encounter-builder",
		pattern:
			/\b(build (me )?an? encounter|scale (this|the) (encounter|fight)|monster lineup|difficulty encounter)/i,
	},
	{
		rule: "advisory:loot-reward",
		agent: "loot-reward",
		pattern:
			/\b(loot|treasure hoard|magic item reward|what (should|do) the (players|party) find)/i,
	},
	{
		rule: "advisory:session-digest",
		agent: "session-digest",
		pattern:
			/\b(session recap|session digest|what happened last session|record (the |a )?session)/i,
	},
	{
		rule: "advisory:character-sheets",
		agent: "character-sheets",
		pattern: /\b(upload|import) (my )?character sheet\b/i,
	},
	{
		rule: "advisory:character",
		agent: "character",
		pattern:
			/\b(create|build|finish) (my |a )?(character|pc)\b|character backstory/i,
	},
	{
		rule: "advisory:campaign-analysis",
		agent: "campaign-analysis",
		pattern:
			/\b(assess my campaign|campaign readiness|how ready is my campaign)/i,
	},
	{
		rule: "advisory:entity-graph",
		agent: "entity-graph",
		pattern:
			/\b(extract entities|entity graph|detect communities|create (a )?relationship)/i,
	},
	{
		rule: "advisory:resources",
		agent: "resources",
		pattern:
			/\b(upload(ed)? (a |this )?(pdf|file)|file key|ingest|index this file)/i,
	},
	{
		rule: "advisory:campaign",
		agent: "campaign",
		pattern:
			/\b(show me( my)? campaigns|list campaigns|create a campaign|delete (my )?campaign)/i,
	},
	{
		rule: "advisory:onboarding",
		agent: "onboarding",
		pattern:
			/\b(how do i (use|upload|get started)|which boost|help me choose a boost|running out of capacity)/i,
	},
	{
		// Last, deliberately: "build an encounter with creepy ambience" is an
		// encounter request that happens to mention sound, and the rules above
		// should claim it first. What reaches here is audio and nothing else.
		rule: "advisory:audio",
		agent: "audio",
		pattern:
			/\b(ambience|ambiance|soundscape|sound effects?|theme (music|song)|background music|creature (sound|noise)|npc voice|in (the|his|her|their) voice|what does .{1,40} sound like)\b/i,
	},
];

/**
 * Guess an agent from loose keyword signals, for logging only.
 *
 * Returns the first matching rule, or null when nothing matches. Confidence is
 * intentionally low: these are hypotheses to be validated against the
 * classifier, not routing decisions.
 */
export function matchAdvisoryRoute(userMessage: string): FastPathMatch | null {
	const trimmed = userMessage.trim();
	if (!trimmed) {
		return null;
	}
	for (const { rule, agent, pattern } of ADVISORY_RULES) {
		if (pattern.test(trimmed)) {
			return {
				agent,
				confidence: 60,
				reason: `Advisory keyword match (${agent})`,
				rule,
			};
		}
	}
	return null;
}
