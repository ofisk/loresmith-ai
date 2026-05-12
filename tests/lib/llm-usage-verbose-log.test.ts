import { afterEach, describe, expect, it, vi } from "vitest";
import { LLM_SPEND_INTENT } from "@/lib/llm-usage-intents";
import {
	isVerboseLlmSpendEnabled,
	LLM_SPEND_VERBOSE_ENV,
	logVerboseLlmSpend,
} from "@/lib/llm-usage-verbose-log";
import * as loggerModule from "@/lib/logger";

describe("logVerboseLlmSpend", () => {
	afterEach(() => {
		delete process.env[LLM_SPEND_VERBOSE_ENV];
		vi.restoreAllMocks();
	});

	it("does not log when verbose flag is off", () => {
		const info = vi.fn();
		vi.spyOn(loggerModule, "createLogger").mockReturnValue({
			info,
		} as unknown as ReturnType<typeof loggerModule.createLogger>);

		logVerboseLlmSpend(undefined, {
			intent: LLM_SPEND_INTENT.embedding_index,
			tokens: 10,
		});

		expect(info).not.toHaveBeenCalled();
	});

	it("emits llm_token_spend with intent when flag is enabled via env object", () => {
		const info = vi.fn();
		vi.spyOn(loggerModule, "createLogger").mockReturnValue({
			info,
		} as unknown as ReturnType<typeof loggerModule.createLogger>);

		logVerboseLlmSpend(
			{ [LLM_SPEND_VERBOSE_ENV]: "true" },
			{
				intent: LLM_SPEND_INTENT.user_prompt,
				source: "test_source",
				username: "alice",
				tokens: 42,
				queryCount: 1,
			}
		);

		expect(info).toHaveBeenCalledTimes(1);
		expect(info.mock.calls[0][0]).toBe("llm_token_spend");
		expect(info.mock.calls[0][1]).toMatchObject({
			event: "llm_token_spend",
			intent: "user_prompt",
			source: "test_source",
			username: "alice",
			tokens: 42,
			queryCount: 1,
		});
	});

	it("respects LORESMITH_VERBOSE_LLM_USAGE from process.env", () => {
		process.env[LLM_SPEND_VERBOSE_ENV] = "1";
		const info = vi.fn();
		vi.spyOn(loggerModule, "createLogger").mockReturnValue({
			info,
		} as unknown as ReturnType<typeof loggerModule.createLogger>);

		logVerboseLlmSpend(undefined, {
			intent: LLM_SPEND_INTENT.graph_rebuild,
			tokens: 99,
		});

		expect(info).toHaveBeenCalledTimes(1);
		expect(info.mock.calls[0][1]).toMatchObject({
			intent: "graph_rebuild",
			tokens: 99,
		});
	});

	it("isVerboseLlmSpendEnabled mirrors env flag", () => {
		expect(isVerboseLlmSpendEnabled(undefined)).toBe(false);
		expect(isVerboseLlmSpendEnabled({ [LLM_SPEND_VERBOSE_ENV]: "on" })).toBe(
			true
		);
	});
});
