/**
 * Structured logging for extraction chunk-gate decisions.
 *
 * Answers the question that decides how far the deterministic pre-gate should
 * go: **how often does the LLM gate disagree with what a cheap rule would have
 * decided?** Filter the drain to `source=llm` and group by `advisoryRule` +
 * `advisoryAgreed` to get a per-rule disagreement rate; a rule that holds up is
 * a candidate for promotion into `classifyChunkDecisively`.
 *
 * Gated behind `LORESMITH_VERBOSE_LLM_USAGE`, the same switch as token-spend and
 * routing logs, rather than adding a third knob.
 */

import type { EnvWithSecrets } from "@/lib/env-utils";
import { isVerboseLlmSpendEnabled } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";
import type { ChunkGateVerdict } from "./extraction-chunk-gate-rules";

export type ChunkGateDecisionLog = {
	source: "deterministic" | "llm";
	runFullExtraction: boolean;
	/** Rule that decided, when `source` is `deterministic`. */
	rule?: string;
	reason?: string;
	/** What the advisory rules would have said, when the LLM branch ran. */
	advisoryVerdict?: ChunkGateVerdict;
	advisoryRule?: string;
	/** Undefined when the advisory verdict was `ambiguous` (a deferral, not a guess). */
	advisoryAgreed?: boolean;
	latencyMs?: number;
	model?: string;
	campaignId?: string;
};

/**
 * Emit one structured chunk-gate decision log line.
 *
 * Never throws: extraction must not fail because logging did.
 */
export function logChunkGateDecision(
	env: EnvWithSecrets | Record<string, unknown> | undefined,
	decision: ChunkGateDecisionLog
): void {
	if (!isVerboseLlmSpendEnabled(env)) {
		return;
	}
	try {
		const log = createLogger(
			env as Record<string, unknown> | undefined,
			"[ExtractionChunkGate]"
		);
		log.info("extraction_chunk_gate_decision", {
			event: "extraction_chunk_gate_decision",
			...decision,
		});
	} catch {
		// Logging is best-effort; a drain problem must not break extraction.
	}
}
