import type { EnvWithSecrets } from "@/lib/env-utils";
import type { LlmSpendIntent } from "@/lib/llm-usage-intents";
import { createLogger } from "@/lib/logger";

export const LLM_SPEND_VERBOSE_ENV = "LORESMITH_VERBOSE_LLM_USAGE";

function readVerboseFlag(env?: Record<string, unknown>): boolean {
	const fromEnv = env?.[LLM_SPEND_VERBOSE_ENV];
	const fromProcess =
		typeof process !== "undefined"
			? process.env[LLM_SPEND_VERBOSE_ENV]
			: undefined;
	const raw =
		(typeof fromEnv === "string" ? fromEnv : undefined) ??
		(typeof fromProcess === "string" ? fromProcess : undefined);
	if (raw === undefined) {
		return fromEnv === true;
	}
	return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

/** Whether structured `llm_token_spend` logs are enabled for this env / process. */
export function isVerboseLlmSpendEnabled(
	env?: EnvWithSecrets | Record<string, unknown>
): boolean {
	return readVerboseFlag(env as Record<string, unknown> | undefined);
}

export type VerboseLlmSpendPayload = {
	intent: LlmSpendIntent;
	source?: string;
	username?: string;
	tokens: number;
	queryCount?: number;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	/** Small, bounded context — never full prompts */
	extras?: Record<string, unknown>;
};

/**
 * Structured info log for token spend debugging when LORESMITH_VERBOSE_LLM_USAGE is on.
 */
export function logVerboseLlmSpend(
	env: EnvWithSecrets | Record<string, unknown> | undefined,
	payload: VerboseLlmSpendPayload
): void {
	if (!readVerboseFlag(env as Record<string, unknown> | undefined)) {
		return;
	}
	const log = createLogger(
		env as Record<string, unknown> | undefined,
		"[LLM_USAGE]"
	);
	const { extras, ...rest } = payload;
	log.info("llm_token_spend", {
		event: "llm_token_spend",
		...rest,
		...(extras && Object.keys(extras).length > 0 ? { extras } : {}),
	});
}
