/**
 * Structured logging for digest consistency-triage decisions.
 *
 * Answers the question that decides how far the deterministic triage should go:
 * **when a cheap rule would have skipped the GraphRAG consistency pass, did that
 * pass actually find anything?** Filter the drain to `source=expensive` and
 * group by `advisoryRule` + `advisorySuppressedFindings` to get a per-rule
 * false-skip rate; a rule that never suppresses a real finding is a candidate
 * for promotion into `triageDigestConsistencyDecisively`.
 *
 * Gated behind `LORESMITH_VERBOSE_LLM_USAGE`, the same switch as token-spend,
 * routing, and chunk-gate logs, rather than adding another knob.
 */

import type { EnvWithSecrets } from "@/lib/env-utils";
import { isVerboseLlmSpendEnabled } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";
import type { DigestConsistencyVerdict } from "./digest-consistency-triage";

export type DigestConsistencyDecisionLog = {
	/** `deterministic` when triage short-circuited; `expensive` when it ran. */
	source: "deterministic" | "expensive";
	ranConsistencyPass: boolean;
	/** Rule that decided, when `source` is `deterministic`. */
	rule?: string;
	reason?: string;
	/** What the advisory rules would have said, when the expensive path ran. */
	advisoryVerdict?: DigestConsistencyVerdict;
	advisoryRule?: string;
	/**
	 * True when the advisory rules said `skip` but the expensive pass returned
	 * findings — i.e. promoting that rule would have cost a real inconsistency.
	 * Undefined when the advisory verdict was `ambiguous` (a deferral, not a
	 * guess) or when the pass did not run.
	 */
	advisorySuppressedFindings?: boolean;
	/** Findings the expensive pass returned. Counts only — never digest text. */
	issueCount?: number;
	narrativeEntries?: number;
	campaignId?: string;
};

/**
 * Emit one structured consistency-triage decision log line.
 *
 * Never throws: quality scoring must not fail because logging did.
 */
export function logDigestConsistencyDecision(
	env: EnvWithSecrets | Record<string, unknown> | undefined,
	decision: DigestConsistencyDecisionLog
): void {
	if (!isVerboseLlmSpendEnabled(env)) {
		return;
	}
	try {
		const log = createLogger(
			env as Record<string, unknown> | undefined,
			"[DigestConsistencyTriage]"
		);
		log.info("digest_consistency_triage_decision", {
			event: "digest_consistency_triage_decision",
			...decision,
		});
	} catch {
		// Logging is best-effort; a drain problem must not break quality scoring.
	}
}
