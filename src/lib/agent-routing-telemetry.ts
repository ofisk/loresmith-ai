/**
 * Structured logging for agent routing decisions.
 *
 * The point of this module is to answer the question that decides how far the
 * deterministic fast path should go: **how often does the LLM classifier
 * disagree with what a cheap rule would have chosen?**
 *
 * Every routing decision emits one `agent_routing_decision` line recording the
 * chosen agent, the confidence, and where the decision came from. When the LLM
 * branch runs we additionally evaluate the advisory rules (which never
 * short-circuit) and log whether they agreed. Filtering the drain to
 * `source=llm` and grouping by `advisoryAgreed` gives the disagreement rate per
 * rule; grouping by `confidenceBucket` gives the confidence distribution.
 *
 * Gated behind the existing `LORESMITH_VERBOSE_LLM_USAGE` flag so routing logs
 * follow the same on/off switch and drain conventions as token-spend logs
 * rather than adding a second knob.
 */

import type { RoutingDecisionSource } from "@/lib/agent-routing-fast-path";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { isVerboseLlmSpendEnabled } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";

export type RoutingDecisionLog = {
	source: RoutingDecisionSource;
	agent: string;
	confidence: number;
	reason: string;
	/** Identifier of the fast-path rule that fired, when one did. */
	rule?: string;
	/** What the advisory rules would have chosen, when the LLM branch ran. */
	advisoryAgent?: string;
	/** Whether the advisory guess matched the final agent. Undefined when no advisory rule matched. */
	advisoryAgreed?: boolean;
	/** Wall-clock cost of the decision, including the LLM call when one happened. */
	latencyMs?: number;
	model?: string;
};

/**
 * Bucket a 0-100 confidence into a coarse band.
 *
 * Buckets rather than raw values because the useful question is distributional
 * ("what share of routed traffic is high-confidence?"), and buckets aggregate
 * cleanly in a log drain without a numeric aggregation step.
 */
export function confidenceBucket(confidence: number): string {
	if (!Number.isFinite(confidence)) return "unknown";
	if (confidence >= 90) return "90-100";
	if (confidence >= 70) return "70-89";
	if (confidence >= 50) return "50-69";
	if (confidence >= 30) return "30-49";
	return "0-29";
}

/**
 * Emit one structured routing-decision log line.
 *
 * Never throws: routing must not fail because logging did.
 */
export function logRoutingDecision(
	env: EnvWithSecrets | Record<string, unknown> | undefined,
	decision: RoutingDecisionLog
): void {
	if (!isVerboseLlmSpendEnabled(env)) {
		return;
	}
	try {
		const log = createLogger(
			env as Record<string, unknown> | undefined,
			"[AgentRouting]"
		);
		log.info("agent_routing_decision", {
			event: "agent_routing_decision",
			...decision,
			confidenceBucket: confidenceBucket(decision.confidence),
		});
	} catch {
		// Logging is best-effort; a drain problem must not break routing.
	}
}
