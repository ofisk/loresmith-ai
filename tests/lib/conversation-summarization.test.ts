import { describe, expect, it } from "vitest";
import {
	buildSummaryPrompt,
	buildSummaryState,
	CONVERSATION_SUMMARY_ENV,
	type ConversationSummaryState,
	fingerprintMessage,
	formatSummaryBlock,
	isConversationSummarizationEnabled,
	isSummaryStateValid,
	MAX_CHARS_PER_SUMMARIZED_MESSAGE,
	planConversationContext,
	RECENT_MESSAGE_WINDOW,
	RESUMMARIZE_BATCH_SIZE,
	SUMMARIZATION_TRIGGER_COUNT,
	type SummarizableMessage,
} from "@/lib/conversation-summarization";

/** Build an alternating user/assistant history of `count` messages. */
function makeMessages(count: number, prefix = "m"): SummarizableMessage[] {
	return Array.from({ length: count }, (_, i) => ({
		role: i % 2 === 0 ? "user" : "assistant",
		content: `${prefix}-${i}`,
	}));
}

function stateCovering(
	messages: SummarizableMessage[],
	coveredCount: number,
	summary = "prior notes"
): ConversationSummaryState {
	return buildSummaryState(summary, messages, coveredCount, 1000);
}

describe("planConversationContext", () => {
	it("keeps everything verbatim for short conversations", () => {
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT - 1);
		const plan = planConversationContext(messages, null);

		expect(plan.needsSummarization).toBe(false);
		expect(plan.verbatimMessages).toEqual(messages);
		expect(plan.priorSummary).toBeNull();
		expect(plan.nextCoveredCount).toBe(0);
	});

	it("summarizes once a full batch has aged past the verbatim window", () => {
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);
		const plan = planConversationContext(messages, null);

		expect(plan.needsSummarization).toBe(true);
		expect(plan.messagesToSummarize).toHaveLength(RESUMMARIZE_BATCH_SIZE);
		expect(plan.verbatimMessages).toHaveLength(RECENT_MESSAGE_WINDOW);
		expect(plan.nextCoveredCount).toBe(RESUMMARIZE_BATCH_SIZE);
		// The split is contiguous: nothing dropped, nothing duplicated.
		expect([...plan.messagesToSummarize, ...plan.verbatimMessages]).toEqual(
			messages
		);
	});

	it("reuses an existing summary without an LLM call until the next batch fills", () => {
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT + 3);
		const state = stateCovering(messages, RESUMMARIZE_BATCH_SIZE);
		const plan = planConversationContext(messages, state);

		expect(plan.needsSummarization).toBe(false);
		expect(plan.priorSummary).toBe("prior notes");
		expect(plan.nextCoveredCount).toBe(RESUMMARIZE_BATCH_SIZE);
		// Stragglers past the covered point ride along verbatim rather than
		// triggering a fresh summarization every turn.
		expect(plan.verbatimMessages).toEqual(
			messages.slice(RESUMMARIZE_BATCH_SIZE)
		);
		expect(plan.verbatimMessages.length).toBeGreaterThan(RECENT_MESSAGE_WINDOW);
	});

	it("folds the accumulated backlog in on the next batch boundary", () => {
		const messages = makeMessages(
			SUMMARIZATION_TRIGGER_COUNT + RESUMMARIZE_BATCH_SIZE
		);
		const state = stateCovering(messages, RESUMMARIZE_BATCH_SIZE);
		const plan = planConversationContext(messages, state);

		expect(plan.needsSummarization).toBe(true);
		expect(plan.priorSummary).toBe("prior notes");
		expect(plan.messagesToSummarize).toEqual(
			messages.slice(RESUMMARIZE_BATCH_SIZE, RESUMMARIZE_BATCH_SIZE * 2)
		);
		expect(plan.nextCoveredCount).toBe(RESUMMARIZE_BATCH_SIZE * 2);
		expect(plan.verbatimMessages).toHaveLength(RECENT_MESSAGE_WINDOW);
	});

	it("bounds the verbatim tail to window + one batch", () => {
		// Simulate many turns: the tail must never grow without bound, because a
		// summarization fires as soon as the backlog reaches a full batch.
		const maxTail = RECENT_MESSAGE_WINDOW + RESUMMARIZE_BATCH_SIZE;
		let state: ConversationSummaryState | null = null;

		for (let total = 1; total <= 200; total++) {
			const messages = makeMessages(total);
			const plan = planConversationContext(messages, state);
			expect(plan.verbatimMessages.length).toBeLessThanOrEqual(maxTail);
			if (plan.needsSummarization) {
				state = buildSummaryState(
					"notes",
					messages,
					plan.nextCoveredCount,
					total
				);
			}
		}
	});

	it("caps a cold-start summarization to maxMessagesPerCall", () => {
		const messages = makeMessages(300);
		const plan = planConversationContext(messages, null, {
			maxMessagesPerCall: 40,
		});

		expect(plan.messagesToSummarize).toHaveLength(40);
		// Keeps the most recent of the aged-out block, which is the most relevant.
		const windowStart = messages.length - RECENT_MESSAGE_WINDOW;
		expect(plan.messagesToSummarize).toEqual(
			messages.slice(windowStart - 40, windowStart)
		);
		expect(plan.nextCoveredCount).toBe(windowStart);
	});

	it("discards a summary whose boundary no longer matches the history", () => {
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT + 5);
		const staleState: ConversationSummaryState = {
			...stateCovering(messages, RESUMMARIZE_BATCH_SIZE),
			fingerprint: "not-the-right-fingerprint",
		};

		const plan = planConversationContext(messages, staleState);

		expect(plan.priorSummary).toBeNull();
		expect(plan.needsSummarization).toBe(true);
		// Re-summarizes from the top rather than trusting the mismatched state.
		expect(plan.messagesToSummarize[0]).toEqual(messages[0]);
	});

	it("discards a summary claiming to cover more messages than exist", () => {
		const messages = makeMessages(SUMMARIZATION_TRIGGER_COUNT);
		const plan = planConversationContext(messages, {
			summary: "notes",
			coveredCount: messages.length + 10,
			fingerprint: "whatever",
			updatedAt: 0,
		});

		expect(plan.priorSummary).toBeNull();
	});
});

describe("isSummaryStateValid", () => {
	const messages = makeMessages(20);

	it("accepts a state whose fingerprint matches the boundary message", () => {
		expect(isSummaryStateValid(stateCovering(messages, 8), messages)).toBe(
			true
		);
	});

	it("rejects null, empty, and zero-coverage states", () => {
		expect(isSummaryStateValid(null, messages)).toBe(false);
		expect(
			isSummaryStateValid(
				{ summary: "   ", coveredCount: 8, fingerprint: "x", updatedAt: 0 },
				messages
			)
		).toBe(false);
		expect(
			isSummaryStateValid(
				{ summary: "notes", coveredCount: 0, fingerprint: "x", updatedAt: 0 },
				messages
			)
		).toBe(false);
	});

	it("rejects a state built against different message content", () => {
		const other = makeMessages(20, "other");
		expect(isSummaryStateValid(stateCovering(other, 8), messages)).toBe(false);
	});
});

describe("fingerprintMessage", () => {
	it("is stable for identical messages and differs on content or role", () => {
		const a: SummarizableMessage = { role: "user", content: "hello there" };
		expect(fingerprintMessage(a)).toBe(fingerprintMessage({ ...a }));
		expect(fingerprintMessage(a)).not.toBe(
			fingerprintMessage({ role: "user", content: "hello world" })
		);
		expect(fingerprintMessage(a)).not.toBe(
			fingerprintMessage({ role: "assistant", content: "hello there" })
		);
	});

	it("handles array (multimodal) content without throwing", () => {
		const message: SummarizableMessage = {
			role: "user",
			content: [{ type: "text", text: "part one" }, { type: "image" }],
		};
		expect(fingerprintMessage(message)).toEqual(expect.any(String));
	});
});

describe("buildSummaryPrompt", () => {
	it("includes the transcript and asks for fresh notes when there is no prior summary", () => {
		const prompt = buildSummaryPrompt(
			[
				{ role: "user", content: "Set the tone to grimdark" },
				{ role: "assistant", content: "Noted." },
			],
			null
		);

		expect(prompt).toContain("USER: Set the tone to grimdark");
		expect(prompt).toContain("ASSISTANT: Noted.");
		expect(prompt).not.toContain("<existing_notes>");
	});

	it("asks for a merge when a prior summary exists", () => {
		const prompt = buildSummaryPrompt(
			[{ role: "user", content: "Rename the campaign" }],
			"## Campaign\nName: Old Name"
		);

		expect(prompt).toContain("<existing_notes>");
		expect(prompt).toContain("Name: Old Name");
		expect(prompt).toContain("<new_turns>");
		expect(prompt).toContain("merged");
	});

	it("truncates individual messages so one huge turn cannot dominate the call", () => {
		const prompt = buildSummaryPrompt(
			[{ role: "user", content: "x".repeat(50_000) }],
			null
		);

		expect(prompt).toContain("[truncated]");
		expect(prompt.length).toBeLessThan(MAX_CHARS_PER_SUMMARIZED_MESSAGE + 2000);
	});

	it("does not emit an empty role line for messages with no text content", () => {
		const prompt = buildSummaryPrompt(
			[{ role: "assistant", content: null }],
			null
		);

		expect(prompt).toContain("ASSISTANT: (no text content)");
	});
});

describe("formatSummaryBlock", () => {
	it("labels the block as background context", () => {
		const block = formatSummaryBlock("  ## Campaign\nName: Rime  ");
		expect(block).toContain("## Earlier conversation summary");
		expect(block).toContain("Name: Rime");
		expect(block).not.toMatch(/\s$/);
	});
});

describe("isConversationSummarizationEnabled", () => {
	it("defaults to enabled when unset", () => {
		expect(isConversationSummarizationEnabled({})).toBe(true);
		expect(isConversationSummarizationEnabled(undefined)).toBe(true);
	});

	it("honours falsy string values as a kill switch", () => {
		for (const value of ["0", "false", "no", "off", "OFF", " false "]) {
			expect(
				isConversationSummarizationEnabled({
					[CONVERSATION_SUMMARY_ENV]: value,
				})
			).toBe(false);
		}
	});

	it("honours truthy string and boolean values", () => {
		expect(
			isConversationSummarizationEnabled({ [CONVERSATION_SUMMARY_ENV]: "true" })
		).toBe(true);
		expect(
			isConversationSummarizationEnabled({ [CONVERSATION_SUMMARY_ENV]: false })
		).toBe(false);
		expect(
			isConversationSummarizationEnabled({ [CONVERSATION_SUMMARY_ENV]: true })
		).toBe(true);
	});
});
