/**
 * Structured logging for character-sheet detection decisions (issue #761).
 *
 * Answers the question that decides how far the deterministic pre-screen should
 * go: **how often does the model disagree with what a vocabulary match would
 * have decided?** Filter the drain to `source=llm` and group by `advisoryRule`
 * + `advisoryAgreed` for a per-rule disagreement rate; a rule that holds up is a
 * candidate for promotion into `classifyCharacterSheetDecisively`.
 *
 * Gated behind `LORESMITH_VERBOSE_LLM_USAGE`, the same switch as token spend and
 * the chunk gate, rather than adding another knob.
 */

import type { EnvWithSecrets } from "@/lib/env-utils";
import { isVerboseLlmSpendEnabled } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";
import type { CharacterSheetVerdict } from "./character-sheet-indicators";

export type CharacterSheetDetectionLog = {
	source: "deterministic" | "llm";
	/** What the pipeline acted on. */
	isCharacterSheet: boolean;
	/** Rule that decided, when `source` is `deterministic`. */
	rule?: string;
	reason?: string;
	/** What the advisory rules would have said, when the model branch ran. */
	advisoryVerdict?: CharacterSheetVerdict;
	advisoryRule?: string;
	/** Undefined when the advisory verdict was `ambiguous` (a deferral, not a guess). */
	advisoryAgreed?: boolean;
	/** Indicator groups matched, so a threshold can be tuned from the logs. */
	groupsMatched?: number;
	documentLength?: number;
	model?: string;
};

/**
 * Emit one structured detection decision line.
 *
 * Never throws: an upload must not fail because logging did.
 */
export function logCharacterSheetDetection(
	env: EnvWithSecrets | Record<string, unknown> | undefined,
	decision: CharacterSheetDetectionLog
): void {
	if (!isVerboseLlmSpendEnabled(env)) {
		return;
	}
	try {
		const log = createLogger(
			env as Record<string, unknown> | undefined,
			"[CharacterSheetDetection]"
		);
		log.info("character_sheet_detection_decision", {
			event: "character_sheet_detection_decision",
			...decision,
		});
	} catch {
		// Logging is best-effort; a drain problem must not break the upload path.
	}
}
